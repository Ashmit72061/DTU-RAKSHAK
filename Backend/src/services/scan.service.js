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
    vehicleNo,          // Normalized plate string
    vehicleNoHash,      // Hashed normalized string for secure Database indexing/joins
    vehicleId: vehicleId ?? null,
    rawPlate,           // string received directly from Edge OCR
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

async function handleSighting({ tx, camera, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, isAuthorized, scanTime, cameraId, activeSession }) {
    let logId = activeSession ? activeSession.logId : null;

    // Fast Redis cache miss fallback
    if (!logId) {
        let dbSession = await tx.entryExitLog.findFirst({
            where: { vehicleNoHash, exitTime: null, logType: "ENTRY" },
            orderBy: { entryTime: "desc" }
        });
        if (dbSession) logId = dbSession.id;
    }

    if (!logId) {
        console.warn(`[Sighting] No active session for ${vehicleNo}. Creating ORPHAN session & Alert.`);
        const orphanSession = await tx.entryExitLog.create({
            data: { ...buildBaseLogData({ cameraId, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, isAuthorized, scanTime }), logType: "ORPHAN" }
        });
        logId = orphanSession.id;
        
        await tx.alert.create({
            data: {
                alertType: "ORPHAN_SIGHTING",
                description: `Vehicle scanned at interior camera but has no active ENTRY session.`,
                rawPlate,
                cameraId,
                logId
            }
        });
    }

    await tx.sighting.create({
        data: {
            sessionId: logId,
            cameraId,
            ocrConfidence: confScore,
            modelConfidence: modelConf,
            rawPlate
        }
    });
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
        console.warn(`[Exit] No active entry session for ${vehicleNo}. Creating ORPHAN log.`);
        const anomalyLog = await tx.entryExitLog.create({
            data: { ...buildBaseLogData({ cameraId, vehicleNo, vehicleNoHash, vehicleId, rawPlate, confScore, modelConf, isAuthorized: true, scanTime }), logType: "ORPHAN" }
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
    // Setting activeKey to 24h to perfectly maintain fast log tracking even after the 30m grace timer expires 
    redis.setex(activeKey, VEHICLE_TTL, JSON.stringify({ logId: log.id, entryTime: new Date(scanTime).toISOString() })).catch(() => {});
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
            rawPlate: jobData.rawPlate, confScore: jobData.ocrConfidence, modelConf: jobData.modelConfidence,
            isAuthorized, scanTime: new Date(jobData.scanTime), cameraId: jobData.camera_id
        };

        const activeKey = KEY_ACTIVE(vehicleNo);
        const activeRaw = await redis.get(activeKey);
        const activeSession = activeRaw ? JSON.parse(activeRaw) : null;

        if (camera.cameraType === "SIGHTING") {
            await prisma.$transaction(async (tx) => handleSighting({ ...ctxBase, tx, activeSession }));
            return;
        }

        if (isAuthorized) {
            await prisma.$transaction(async (tx) => {
                if (camera.cameraType === "ENTRY") {
                    if (activeSession) {
                        // Anomaly: Car was already inside, but entered again. Leave old session open, just log alert.
                        await tx.alert.create({ data: { alertType: "CONCURRENT_ENTRY_OVERWRITE", description: "Registered vehicle scanned at ENTRY but was already inside campus. Previous session left open.", rawPlate: ctxBase.rawPlate, cameraId: camera.id, logId: activeSession.logId } });
                    }
                    await handleAuthEntry({ ...ctxBase, tx, activeKey });
                } else if (camera.cameraType === "EXIT") {
                    await handleAuthExit({ ...ctxBase, tx, activeKey, activeSession });
                }
            });
            return;
        }

        const unauthKey = KEY_UNAUTH(vehicleNo);
        const unauthData = await redis.get(unauthKey);

        await prisma.$transaction(async (tx) => {
            if (camera.cameraType === "ENTRY") {
                if (activeSession) {
                    // Anomaly: Unauth car was already inside, but entered again. Leave old session open, just log alert.
                    await tx.alert.create({ data: { alertType: "CONCURRENT_ENTRY_OVERWRITE", description: "Unverified vehicle scanned at ENTRY but was already inside campus. Previous session left open.", rawPlate: ctxBase.rawPlate, cameraId: camera.id, logId: activeSession.logId } });
                    clearUnauthSession(unauthKey, activeKey).catch(() => {});
                }
                await handleUnauthEntry({ ...ctxBase, tx, unauthKey, activeKey });
                
            } else if (camera.cameraType === "EXIT") {
                if (unauthData) {
                    await handleUnauthRescan({ ...ctxBase, tx, unauthData, unauthKey, activeKey });
                } else if (activeSession) {
                    // Brilliant dual-TTL diff: activeSession survived because it has 24h TTL, but unauthData expired perfectly at 30m! OVERSTAY detected instantly in RAM.
                    const duration = Math.round((new Date(ctxBase.scanTime) - new Date(activeSession.entryTime)) / 1000);
                    await tx.entryExitLog.update({ where: { id: activeSession.logId }, data: { logType: "EXIT", exitTime: ctxBase.scanTime, vehicleDuration: duration, cameraId: camera.id, ocrConfidence: ctxBase.confScore, modelConfidence: ctxBase.modelConf } });
                    await tx.alert.create({ data: { alertType: "OVERSTAY", description: `Unverified vehicle exited. Session heavily exceeded 30m timeframe (${duration}s).`, rawPlate: ctxBase.rawPlate, cameraId: camera.id, logId: activeSession.logId } });
                    redis.del(activeKey).catch(() => {});
                } else {
                    // Redis intentionally dropped it after exactly 30 minutes to save RAM. Safely recover the old session from PostgreSQL.
                    const dbSession = await tx.entryExitLog.findFirst({ where: { vehicleNoHash, exitTime: null, logType: "ENTRY" }, orderBy: { entryTime: "desc" } });

                    if (dbSession) {
                        const duration = Math.round((new Date(ctxBase.scanTime) - new Date(dbSession.entryTime)) / 1000);
                        await tx.entryExitLog.update({ where: { id: dbSession.id }, data: { logType: "EXIT", exitTime: ctxBase.scanTime, vehicleDuration: duration, cameraId: camera.id, ocrConfidence: ctxBase.confScore, modelConfidence: ctxBase.modelConf } });
                        await tx.alert.create({ data: { alertType: "OVERSTAY", description: `Unverified vehicle exited (Redis recovered). Session heavily exceeded 30m timeframe (${duration}s).`, rawPlate: ctxBase.rawPlate, cameraId: camera.id, logId: dbSession.id } });
                    } else {
                        // Truly a ghost car! It literally never entered at the gate.
                        const anomalyLog = await tx.entryExitLog.create({
                            data: { ...buildBaseLogData({ cameraId: camera.id, vehicleNo, vehicleNoHash, vehicleId: null, rawPlate: ctxBase.rawPlate, confScore: ctxBase.confScore, modelConf: ctxBase.modelConf, isAuthorized: false, scanTime: ctxBase.scanTime }), logType: "ORPHAN" }
                        });
                        await tx.alert.create({ data: { alertType: "EXIT_WITHOUT_ENTRY", description: `Unverified vehicle exited without an active ENTRY session.`, rawPlate: ctxBase.rawPlate, cameraId: camera.id, logId: anomalyLog.id } });
                    }
                }
            }
        });

    } finally {
        if (lock) await lock.release().catch(() => {});
    }
}
