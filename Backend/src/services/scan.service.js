import prisma from "../models/prisma.js";
import redis from "../models/redis.js";
import redlock from "../utils/redlock.js";
import { 
    ValidationError, 
    LowConfidenceError, 
    CameraNotFoundError 
} from "../utils/errors.js";

const KEY_VEHICLE = (plate) => `vehicle:${plate}`;
const KEY_CAMERA = (id) => `camera:${id}`;

const TTL_24H = 24 * 60 * 60; // 24 hours

// 1. Validation Logic
function validateInput(data) {
    if (!data.camera_id || !data.vehicleNo) {
        throw new ValidationError("Missing camera_id or vehicleNo in job data");
    }
    return data;
}

// 2. Confidence Logic
function applyConfidenceLogic(confidence, model_confidence) {
    const ocr = confidence || 0;
    const model = model_confidence || 0;
    
    // If edge device provided no confidence score, automatically trust it
    if (ocr === 0 && model === 0) return true; 

    // Reject low confidence plates to prevent polluting the DB logs
    if (ocr < 0.6 && model < 0.6) {
        throw new LowConfidenceError(`Confidence too low. OCR: ${ocr}, Model: ${model}`);
    }
    return true;
}

// 3. Camera Fetching with Caching
async function fetchCameraFromCache(cameraId) {
    const cacheKey = KEY_CAMERA(cameraId);
    let cached = await redis.get(cacheKey);
    
    if (cached) return JSON.parse(cached);

    const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
    if (!camera) throw new CameraNotFoundError(`Camera ${cameraId} not found in database`);

    // Only allow strictly typed cameras to prevent logical collisions
    if (!["ENTRY", "EXIT", "SIGHTING"].includes(camera.cameraType)) {
        throw new ValidationError(`Camera ${cameraId} has invalid config type: ${camera.cameraType}`);
    }

    await redis.setex(cacheKey, TTL_24H, JSON.stringify(camera));
    return camera;
}

// 4. Vehicle Resolution
export async function resolveVehicle(vehicleNo) {
    const cacheKey = KEY_VEHICLE(vehicleNo);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dbVehicle = await prisma.vehicle.findUnique({ where: { vehicleNo } });
    const payload = dbVehicle
        ? { isAuthorized: true, vehicleId: dbVehicle.id }
        : { isAuthorized: false, vehicleId: null };

    await redis.setex(cacheKey, TTL_24H, JSON.stringify(payload));
    return payload;
}

// 5. Handlers
async function handleEntry(camera, vehicleNo, vehicleInfo, rawPlate, conf, modelConf) {
    return await prisma.$transaction(async (tx) => {
        // Prevent duplicate active session
        const existingActive = await tx.entryExitLog.findFirst({
            where: { vehicleNo, exitTime: null, logType: "ENTRY" }
        });

        if (existingActive) {
            console.log(`[Entry] Duplicate entry attempted for ${vehicleNo}, closing old session and creating ALERT.`);
            await tx.entryExitLog.update({
                where: { id: existingActive.id },
                data: { exitTime: new Date(), vehicleDuration: 0 } // Close the stray previous session quickly
            });

            await tx.alert.create({
                data: {
                    alertType: "CONCURRENT_ENTRY_OVERWRITE",
                    severity: "HIGH",
                    description: `Vehicle ${vehicleNo} scanned at ENTRY gate but was already inside. Previous session forcefully closed.`,
                    vehicleNo,
                    cameraId: camera.id,
                    logId: existingActive.id
                }
            });
        }

        await tx.entryExitLog.create({
            data: {
                cameraId: camera.id,
                vehicleNo,
                vehicleId: vehicleInfo.vehicleId,
                rawPlate,
                ocrConfidence: conf,
                modelConfidence: modelConf,
                logType: "ENTRY",
                isAuthorized: vehicleInfo.isAuthorized,
                vehicleCategory: vehicleInfo.isAuthorized ? "REGISTERED" : "UNVERIFIED"
            }
        });
    });
}

async function handleExit(camera, vehicleNo, vehicleInfo, rawPlate, conf, modelConf) {
    return await prisma.$transaction(async (tx) => {
        const activeSession = await tx.entryExitLog.findFirst({
            where: { vehicleNo, exitTime: null, logType: "ENTRY" },
            orderBy: { entryTime: "desc" }
        });

        const exitTime = new Date();

        if (!activeSession) {
            console.warn(`[Exit] No active entry session for ${vehicleNo}. Creating standalone EXIT log and ALERT.`);
            const anomalyLog = await tx.entryExitLog.create({
                data: {
                    cameraId: camera.id,
                    vehicleNo,
                    vehicleId: vehicleInfo.vehicleId,
                    rawPlate,
                    ocrConfidence: conf,
                    modelConfidence: modelConf,
                    logType: "EXIT",
                    exitTime,
                    isAuthorized: vehicleInfo.isAuthorized,
                    vehicleCategory: vehicleInfo.isAuthorized ? "REGISTERED" : "UNVERIFIED"
                }
            });

            await tx.alert.create({
                data: {
                    alertType: "EXIT_WITHOUT_ENTRY",
                    severity: "MEDIUM",
                    description: `Vehicle ${vehicleNo} scanned at EXIT gate but had no active ENTRY session.`,
                    vehicleNo,
                    cameraId: camera.id,
                    logId: anomalyLog.id
                }
            });
            return;
        }

        const duration = Math.round((exitTime - activeSession.entryTime) / 1000);

        await tx.entryExitLog.update({
            where: { id: activeSession.id },
            data: {
                exitTime,
                vehicleDuration: duration
            }
        });
    });
}

async function handleSighting(camera, vehicleNo, vehicleInfo, rawPlate, conf, modelConf) {
    return await prisma.$transaction(async (tx) => {
        let activeSession = await tx.entryExitLog.findFirst({
            where: { vehicleNo, exitTime: null, logType: "ENTRY" },
            orderBy: { entryTime: "desc" }
        });

        if (!activeSession) {
            console.warn(`[Sighting] No active session for ${vehicleNo}. Creating ORPHAN session and ALERT.`);
            activeSession = await tx.entryExitLog.create({
                data: {
                    cameraId: camera.id,
                    vehicleNo,
                    vehicleId: vehicleInfo.vehicleId,
                    rawPlate,
                    ocrConfidence: conf,
                    modelConfidence: modelConf,
                    logType: "ORPHAN",
                    isAuthorized: vehicleInfo.isAuthorized,
                    vehicleCategory: vehicleInfo.isAuthorized ? "REGISTERED" : "UNVERIFIED"
                }
            });

            await tx.alert.create({
                data: {
                    alertType: "ORPHAN_SIGHTING",
                    severity: "LOW",
                    description: `Vehicle ${vehicleNo} spotted at interior camera but has no active ENTRY session.`,
                    vehicleNo,
                    cameraId: camera.id,
                    logId: activeSession.id
                }
            });
        }

        await tx.sighting.create({
            data: {
                sessionId: activeSession.id,
                cameraId: camera.id,
                ocrConfidence: conf,
                modelConfidence: modelConf
            }
        });
    });
}

// Main Orchestrator
export async function processScanJob(jobData) {
    const data = validateInput(jobData);
    applyConfidenceLogic(data.confidence, data.model_confidence);
    
    // Concurrency Lock: Ensure absolute linearity per strict vehicle
    const lockKey = `lock:vehicle:${data.vehicleNo}`;
    let lock;
    try {
        lock = await redlock.acquire([lockKey], 3000); // 3 sec lock

        const camera = await fetchCameraFromCache(data.camera_id);
        const vehicleInfo = await resolveVehicle(data.vehicleNo);

        if (camera.cameraType === "ENTRY") {
            await handleEntry(camera, data.vehicleNo, vehicleInfo, data.rawPlate, data.confidence, data.model_confidence);
        } else if (camera.cameraType === "EXIT") {
            await handleExit(camera, data.vehicleNo, vehicleInfo, data.rawPlate, data.confidence, data.model_confidence);
        } else if (camera.cameraType === "SIGHTING") {
            await handleSighting(camera, data.vehicleNo, vehicleInfo, data.rawPlate, data.confidence, data.model_confidence);
        }

    } finally {
        // Guarantee unlocking even if an unexpected error occurs during transactions
        if (lock) await lock.release().catch(() => {});
    }
}

// Expose these empty fallbacks just so the older analytics controllers (getLogs) don't crash
export const KEY_ACTIVE = (plate) => `active:${plate}`;
export const KEY_UNAUTH = (plate) => `unauth:${plate}`;
