import prisma from "../models/prisma.js";
import redis from "../models/redis.js";
import redlock from "../utils/redlock.js";
import { hashField } from "../utils/crypto.util.js";
import { 
    ValidationError, 
    CameraNotFoundError 
} from "../utils/errors.js";

// ── Redis key helpers 
export const KEY_VEHICLE = (plate) => `vehicle:${plate}`;   // auth cache  (24h)
export const KEY_ACTIVE = (plate) => `active:${plate}`;    // current entry session
export const KEY_UNAUTH = (plate) => `unauth:${plate}`;    // 30-min unauth window
export const UNAUTH_TTL = 30 * 60;                         // 30 minutes in seconds
export const VEHICLE_TTL = 24 * 60 * 60;                   // 24 hours in seconds

// ── Shared internal helpers 
const buildBaseLogData = ({ cameraId, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, isAuthorized, scanTime }) => ({
    cameraId,
    vehicleNo,          // Raw plate string kept for audit trail
    vehicleNoHash,      // Hashed plate string for secure indexing/joins
    vehicleId: vehicleId ?? null,
    rawPlate,
    ocrConfidence: confScore,
    modelConfidence: modelConf,
    isAuthorized,
    entryTime: scanTime,
});

const clearUnauthSession = (unauthKey, activeKey) => Promise.all([redis.del(unauthKey), redis.del(activeKey)]);

async function fetchCameraFromCache(cameraId) {
    const cacheKey = `camera:${cameraId}`;
    let cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
    if (!camera) throw new CameraNotFoundError(`Camera ${cameraId} not found`);

    await redis.setex(cacheKey, VEHICLE_TTL, JSON.stringify(camera));
    return camera;
}

// ── Vehicle auth: Redis → DB 
async function resolveVehicle(vehicleNo) {
    const cacheKey = KEY_VEHICLE(vehicleNo);
    const cached   = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const vehicleNoHash = hashField(vehicleNo);
    const dbVehicle     = await prisma.vehicle.findUnique({ where: { vehicleNoHash } });

    const payload = dbVehicle
        ? { isAuthorized: true, vehicleId: dbVehicle.id }
        : { isAuthorized: false, vehicleId: null };

    await redis.setex(cacheKey, VEHICLE_TTL, JSON.stringify(payload));
    return payload;
}

// ── Handlers (Wrapped in transactions by orchestration) ──

//  INTERIOR camera → log a SIGHTING only, no entry/exit gate logic
async function handleSighting({ tx, camera, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, isAuthorized, scanTime, cameraId }) {
    let activeSession = await tx.entryExitLog.findFirst({
        where: { vehicleNoHash, exitTime: null, logType: "ENTRY" },
        orderBy: { entryTime: "desc" }
    });

    if (!activeSession) {
        console.warn(`[Sighting] No active session for ${vehicleNo}. Creating ORPHAN session & Alert.`);
        activeSession = await tx.entryExitLog.create({
            data: { ...buildBaseLogData({ cameraId, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, isAuthorized, scanTime }), logType: "ORPHAN" }
        });
        
        await tx.alert.create({
            data: {
                alertType: "ORPHAN_SIGHTING",
                description: `Vehicle scanned at interior camera but has no active ENTRY session.`,
                rawPlate,
                cameraId,
                logId: activeSession.id
            }
        });
    }

    await tx.sighting.create({
        data: {
            sessionId: activeSession.id,
            cameraId,
            ocrConfidence: confScore,
            modelConfidence: modelConf,
            rawPlate
        }
    });

    // Invalidate the path cache for this session so the map UI fetches fresh data
    redis.del(`entryPath:${activeSession.id}`).catch(() => {});
}

//  AUTHORIZED vehicle — ENTRY 
async function handleAuthEntry({ tx, camera, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, scanTime, cameraId, activeKey }) {
    const log = await tx.entryExitLog.create({
        data: { ...buildBaseLogData({ cameraId, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, isAuthorized: true, scanTime }), logType: "ENTRY" }
    });
    // Store logId + entryTime for fast purely Redis-driven EXIT checks
    redis.setex(activeKey, VEHICLE_TTL, JSON.stringify({ logId: log.id, entryTime: scanTime.toISOString() })).catch(() => {});
}

//  AUTHORIZED vehicle — EXIT 
async function handleAuthExit({ tx, camera, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, scanTime, cameraId, activeKey, activeSession }) {
    let { logId, entryTime } = activeSession ?? {};
    entryTime = entryTime ? new Date(entryTime) : null;

    if (!logId || !entryTime) {
        const fallback = await tx.entryExitLog.findFirst({
            where: { vehicleNoHash, logType: "ENTRY", exitTime: null },
            orderBy: { entryTime: "desc" }
        });
        if (fallback) { logId = fallback.id; entryTime = fallback.entryTime; }
    }

    if (!logId) {
        console.warn(`[Exit] No active entry session for ${vehicleNo}. Creating standalone EXIT log.`);
        const anomalyLog = await tx.entryExitLog.create({
            data: { ...buildBaseLogData({ cameraId, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, isAuthorized: true, scanTime }), logType: "EXIT", exitTime: scanTime }
        });
        
        await tx.alert.create({
            data: {
                alertType: "EXIT_WITHOUT_ENTRY",
                description: `Registered vehicle scanned at EXIT gate but had no active ENTRY session.`,
                rawPlate,
                cameraId,
                logId: anomalyLog.id
            }
        });
        return;
    }

    const duration = entryTime ? Math.round((new Date(scanTime) - entryTime) / 1000) : null;
    await tx.entryExitLog.update({
        where: { id: logId },
        data: { logType: "EXIT", exitTime: scanTime, vehicleDuration: duration, cameraId, ocrConfidence: confScore, modelConfidence: modelConf }
    });
    redis.del(activeKey).catch(() => {});
}

//  UNAUTHORIZED vehicle — ENTRY (starts 30-min window)
async function handleUnauthEntry({ tx, camera, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, scanTime, cameraId, unauthKey, activeKey }) {
    const log = await tx.entryExitLog.create({
        data: { ...buildBaseLogData({ cameraId, vehicleNo, vehicleNoHash, vehicleId: null, rawPlate, confScore, modelConf, isAuthorized: false, scanTime }), logType: "ENTRY" }
    });

    const allowedUntil = new Date(new Date(scanTime).getTime() + UNAUTH_TTL * 1000).toISOString();
    redis.setex(unauthKey, UNAUTH_TTL, JSON.stringify({ logId: log.id, entryTime: new Date(scanTime).toISOString(), allowedUntil })).catch(() => {});
    redis.setex(activeKey, UNAUTH_TTL, JSON.stringify({ logId: log.id, entryTime: new Date(scanTime).toISOString() })).catch(() => {});
}

//  UNAUTHORIZED vehicle — RESCAN (overstay or normal exit)
async function handleUnauthRescan({ tx, camera, vehicleNo, vehicleNoHash, scanTime, cameraId, unauthData, unauthKey, activeKey }) {
    const { logId, entryTime, allowedUntil } = JSON.parse(unauthData);
    const isOverdue = new Date(scanTime) > new Date(allowedUntil);
    const duration = Math.round((new Date(scanTime) - new Date(entryTime)) / 1000);

    await tx.entryExitLog.update({
        where: { id: logId },
        data: { logType: "EXIT", exitTime: scanTime, vehicleDuration: duration }
    });
    
    if (isOverdue) {
        await tx.alert.create({
            data: {
                alertType: "OVERSTAY",
                description: `Unverified vehicle overstayed 30-minute limit. Total duration: ${duration}s`,
                rawPlate,
                cameraId,
                logId
            }
        });
    }

    clearUnauthSession(unauthKey, activeKey).catch(() => {});
}

// ── Main Orchestrator for BullMQ ──
export async function processScanJob(jobData) {
    if (!jobData.camera_id || !jobData.vehicleNo) throw new ValidationError("Missing inputs");

    const vehicleNo = jobData.vehicleNo;
    const vehicleNoHash = hashField(vehicleNo);
    const lockKey = `lock:vehicle:${vehicleNoHash}`;
    let lock;
    
    try {
        lock = await redlock.acquire([lockKey], 3000);

        const camera = await fetchCameraFromCache(jobData.camera_id);
        const authInfo = await resolveVehicle(vehicleNo);
        const isAuthorized = authInfo.isAuthorized;

        const ctxBase = {
            camera, vehicleNo, vehicleNoHash, vehicleId: authInfo.vehicleId ?? null, 
            rawPlate: jobData.rawPlate, confScore: jobData.confidence, modelConf: jobData.model_confidence,
            isAuthorized, scanTime: new Date(jobData.scanTime), cameraId: jobData.camera_id
        };

        if (camera.cameraType === "SIGHTING" || camera.cameraType === "INTERIOR") {
            await prisma.$transaction(async (tx) => handleSighting({ ...ctxBase, tx }));
            return;
        }

        const activeKey = KEY_ACTIVE(vehicleNo);
        const activeRaw = await redis.get(activeKey);
        const activeSession = activeRaw ? JSON.parse(activeRaw) : null;

        if (isAuthorized) {
            await prisma.$transaction(async (tx) => {
                if (activeSession) {
                    await handleAuthExit({ ...ctxBase, tx, activeKey, activeSession });
                } else {
                    await handleAuthEntry({ ...ctxBase, tx, activeKey });
                }
            });
            return;
        }

        const unauthKey = KEY_UNAUTH(vehicleNo);
        const unauthData = await redis.get(unauthKey);

        await prisma.$transaction(async (tx) => {
            if (unauthData) {
                await handleUnauthRescan({ ...ctxBase, tx, unauthData, unauthKey, activeKey });
            } else if (!activeSession) {
                await handleUnauthEntry({ ...ctxBase, tx, unauthKey, activeKey });
            } else {
                // Edge case: unauth vehicle has active session but unauth session expired heavily out of redis cache (over 30m)
                await tx.entryExitLog.update({
                    where: { id: activeSession.logId },
                    data: { logType: "EXIT", exitTime: ctxBase.scanTime }
                });
                await tx.alert.create({
                    data: { 
                        alertType: "OVERSTAY", 
                        description: `Unverified vehicle exited. Session heavily exceeded 30m timeline bounds.`, 
                        rawPlate: ctxBase.rawPlate, 
                        cameraId: camera.id, 
                        logId: activeSession.logId 
                    }
                });
                clearUnauthSession(unauthKey, activeKey).catch(() => {});
            }
        });

    } finally {
        if (lock) await lock.release().catch(() => {});
    }
}
