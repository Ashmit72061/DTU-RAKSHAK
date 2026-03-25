import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import redis from "../models/redis.js";
import ApiResponse from "../utils/ApiResponse.js";
import { hashField, normalizeVehicleNo, decryptVehicle } from "../utils/crypto.util.js";

// ── Redis key helpers 
export const KEY_VEHICLE = (plate) => `vehicle:${plate}`;   // auth cache  (24h)
export const KEY_ACTIVE  = (plate) => `active:${plate}`;    // current entry session
export const KEY_UNAUTH  = (plate) => `unauth:${plate}`;    // 30-min unauth window
export const UNAUTH_TTL  = 30 * 60;                         // 30 minutes in seconds
export const VEHICLE_TTL = 24 * 60 * 60;                    // 24 hours in seconds

// ── Vehicle auth: Redis → DB 
// Lookup by vehicleNoHash (plate is encrypted in DB; hash is the only way to find it)
export async function resolveVehicle(vehicleNo) {
    const cacheKey = KEY_VEHICLE(vehicleNo);
    const cached   = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const vehicleNoHash = hashField(vehicleNo); // vehicleNo is already normalised by caller
    const dbVehicle     = await prisma.vehicle.findUnique({ where: { vehicleNoHash } });

    const payload = dbVehicle
        ? { isAuthorized: true, vehicleId: dbVehicle.id, name: dbVehicle.name, dept: dbVehicle.dept, vehicleType: dbVehicle.vehicleType }
        : { isAuthorized: false, vehicleId: null };

    await redis.setex(cacheKey, VEHICLE_TTL, JSON.stringify(payload));
    return payload;
}

// ── Shared internal helpers 

/**
 * Common fields for every EntryExitLog create.
 * vehicleNoHash is stored alongside the raw plate for filtered queries / history lookup.
 */
const buildBaseLogData = ({ cameraId, vehicleNo, vehicleId, rawPlate, confScore, isAuthorized, scanTime }) => ({
    cameraId,
    vehicleNo,
    vehicleNoHash: hashField(vehicleNo), // vehicleNo is already normalised at this point
    vehicleId:     vehicleId ?? null,
    rawPlate,
    confidence:    confScore,
    isAuthorized,
    vehicleCategory: isAuthorized ? "REGISTERED" : "UNVERIFIED",
    entryTime:     scanTime,
});

/** Delete both Redis keys for an unauth session in parallel */
const clearUnauthSession = (unauthKey, activeKey) =>
    Promise.all([redis.del(unauthKey), redis.del(activeKey)]);

/** Compact camera shape used in every response */
const cameraInfo = (camera, includeType = false) => ({
    id:       camera.id,
    location: camera.cameraLocation,
    ...(includeType && { type: camera.cameraType }),
});

/**
 * Strip mobileNo from scan-response vehicle objects.
 * Scan endpoints don't need phone numbers — avoid unnecessary decryption.
 */
const safeScanVehicle = (vehicle) => {
    if (!vehicle) return null;
    const decrypted = decryptVehicle(vehicle);
    const { mobileNo, ...rest } = decrypted;
    return rest;
};

//  INTERIOR camera → log a SIGHTING only, no entry/exit gate logic
export async function handleSighting({ res, camera, vehicleNo, vehicleId, rawPlate, confScore, isAuthorized, authInfo, scanTime, camera_id }) {
    const log = await prisma.entryExitLog.create({
        data: { ...buildBaseLogData({ cameraId: camera_id, vehicleNo, vehicleId, rawPlate, confScore, isAuthorized, scanTime }), logType: "SIGHTING" },
        include: { camera: true, vehicle: true },
    });

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
        event:       "SIGHTING",
        vehicleNo,
        isAuthorized,
        vehicleInfo: isAuthorized ? authInfo : null,
        camera:      cameraInfo(camera, true),
        log:         { ...log, vehicle: safeScanVehicle(log.vehicle) },
    }, `Vehicle ${vehicleNo} sighted at ${camera.cameraLocation}`));
}

//  AUTHORIZED vehicle — ENTRY (no active session in Redis)
export async function handleAuthEntry({ res, camera, vehicleNo, vehicleId, rawPlate, confScore, authInfo, scanTime, camera_id, activeKey }) {
    const log = await prisma.entryExitLog.create({
        data: { ...buildBaseLogData({ cameraId: camera_id, vehicleNo, vehicleId, rawPlate, confScore, isAuthorized: true, scanTime }), logType: "ENTRY" },
        include: { camera: true, vehicle: true },
    });

    // Store logId + entryTime so EXIT needs zero extra DB queries
    await redis.setex(activeKey, VEHICLE_TTL, JSON.stringify({ logId: log.id, entryTime: scanTime.toISOString() }));

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
        event:       "ENTRY",
        vehicleNo,
        isAuthorized: true,
        vehicleInfo: authInfo,
        message:     "✅ Entry granted — registered vehicle",
        camera:      cameraInfo(camera),
        log:         { ...log, vehicle: safeScanVehicle(log.vehicle) },
    }, "Entry granted"));
}

//  AUTHORIZED vehicle — EXIT (active session found in Redis)
export async function handleAuthExit({ res, camera, vehicleNo, authInfo, scanTime, camera_id, activeKey, activeSession }) {
    const exitTime = scanTime;

    // Pull logId + entryTime from Redis — no extra DB query needed
    let { logId, entryTime } = activeSession ?? {};
    entryTime = entryTime ? new Date(entryTime) : null;

    // DB fallback if Redis was flushed mid-session
    if (!logId || !entryTime) {
        const vehicleNoHash = hashField(vehicleNo);
        const fallback = await prisma.entryExitLog.findFirst({
            where:   { vehicleNoHash, logType: "ENTRY", exitTime: null },
            orderBy: { entryTime: "desc" },
        });
        if (fallback) { logId = fallback.id; entryTime = fallback.entryTime; }
    }

    const duration = entryTime ? Math.round((exitTime - entryTime) / 1000) : null;

    const log = await prisma.entryExitLog.update({
        where:   { id: logId },
        data:    { logType: "EXIT", exitTime, vehicleDuration: duration, cameraId: camera_id },
        include: { camera: true, vehicle: true },
    });

    await redis.del(activeKey);

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
        event:           "EXIT",
        vehicleNo,
        isAuthorized:    true,
        vehicleInfo:     authInfo,
        vehicleDuration: duration,
        message:         "👋 Exit recorded — registered vehicle",
        camera:          cameraInfo(camera),
        log:             { ...log, vehicle: safeScanVehicle(log.vehicle) },
    }, "Exit recorded"));
}

//  UNAUTHORIZED vehicle — first time seen → ENTRY + start 30-min window
export async function handleUnauthEntry({ res, camera, vehicleNo, rawPlate, confScore, scanTime, camera_id, unauthKey, activeKey }) {
    const log = await prisma.entryExitLog.create({
        data: { ...buildBaseLogData({ cameraId: camera_id, vehicleNo, vehicleId: null, rawPlate, confScore, isAuthorized: false, scanTime }), logType: "ENTRY" },
        include: { camera: true, vehicle: true },
    });

    const allowedUntil = new Date(scanTime.getTime() + UNAUTH_TTL * 1000).toISOString();
    await redis.setex(unauthKey, UNAUTH_TTL, JSON.stringify({ logId: log.id, entryTime: scanTime, allowedUntil }));
    await redis.setex(activeKey, UNAUTH_TTL, JSON.stringify({ logId: log.id, entryTime: scanTime.toISOString() }));

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
        event:           "ENTRY",
        vehicleNo,
        isAuthorized:    false,
        vehicleCategory: "UNVERIFIED",
        message:         "⚠️ Unverified vehicle — allowed. 30-minute stay limit applies.",
        allowedUntil,
        camera:          cameraInfo(camera),
        log,
    }, "Unverified vehicle entry — 30-min limit"));
}

//  UNAUTHORIZED vehicle — seen again (overstay or normal exit)
export async function handleUnauthRescan({ res, camera, vehicleNo, scanTime, unauthData, unauthKey, activeKey }) {
    const { logId, entryTime, allowedUntil } = JSON.parse(unauthData);
    const isOverdue = new Date() > new Date(allowedUntil);

    const exitTime = scanTime;
    const duration = Math.round((exitTime - new Date(entryTime)) / 1000);

    // Close the log and clear Redis — same for both overstay and normal exit
    await prisma.entryExitLog.update({
        where: { id: logId },
        data:  { logType: "EXIT", exitTime, vehicleDuration: duration },
    });
    await clearUnauthSession(unauthKey, activeKey);

    if (isOverdue) {
        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
            event:           "OVERSTAY_EXIT",
            vehicleNo,
            isAuthorized:    false,
            vehicleCategory: "UNVERIFIED",
            message:         "🚨 ALERT: Unverified vehicle overstayed 30-minute limit!",
            allowedUntil,
            vehicleDuration: duration,
            camera:          cameraInfo(camera),
        }, "⚠️ Unverified vehicle overstay alert"));
    }

    // Normal exit — fetch updated log with relations for response
    const log = await prisma.entryExitLog.findUnique({ where: { id: logId }, include: { camera: true, vehicle: true } });

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
        event:           "EXIT",
        vehicleNo,
        isAuthorized:    false,
        vehicleCategory: "UNVERIFIED",
        message:         "👋 Unverified vehicle exited within allowed window.",
        vehicleDuration: duration,
        allowedUntil,
        camera:          cameraInfo(camera),
        log:             { ...log, vehicle: safeScanVehicle(log.vehicle) },
    }, "Unverified vehicle exit"));
}
