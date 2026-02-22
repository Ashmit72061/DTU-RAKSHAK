import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import redis from "../models/redis.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// ── Redis key helpers ──────────────────────────────────────────────────────────
const KEY_VEHICLE   = (plate) => `vehicle:${plate}`;          // auth cache  (24h)
const KEY_ACTIVE    = (plate) => `active:${plate}`;           // current entry log id
const KEY_UNAUTH    = (plate) => `unauth:${plate}`;           // 30-min unauth window
const UNAUTH_TTL    = 30 * 60;                                // 30 minutes in seconds
const VEHICLE_TTL   = 24 * 60 * 60;                           // 24 hours

// ── Plate normalisation + Indian plate format validation ───────────────────────
// Indian format: 2 letters (state) + 1-2 digits (district) + 1-3 letters (series) + 4 digits
// e.g.  DL3CAF0001  |  MH12AB1234  |  UP32K5678  |  HR26A0001
const PLATE_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;

const normalisePlate = (raw) => {
    let clean = raw.toUpperCase().replace(/\s/g, "").replace(/[-./]/g, "");

    // Strip known OCR noise prefix if present and remainder is a valid plate
    const stripped = clean.replace(/^(INC|IND|VH|REG|NO|NUM)/, "");
    if (PLATE_REGEX.test(stripped)) clean = stripped;

    if (!PLATE_REGEX.test(clean)) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Invalid number plate format: "${raw}". Expected Indian format e.g. DL3CAF0001`
        );
    }
    return clean;
};

// ── Check / populate vehicle auth from Redis → DB ─────────────────────────────
async function resolveVehicle(vehicleNo) {
    const cacheKey = KEY_VEHICLE(vehicleNo);
    const cached   = await redis.get(cacheKey);

    if (cached) {
        return JSON.parse(cached);            // cache hit
    }

    // cache miss → query DB
    const dbVehicle = await prisma.vehicle.findUnique({ where: { vehicleNo } });
    const payload   = dbVehicle
        ? { isAuthorized: true,  name: dbVehicle.name, dept: dbVehicle.dept, vehicleType: dbVehicle.vehicleType }
        : { isAuthorized: false };

    await redis.setex(cacheKey, VEHICLE_TTL, JSON.stringify(payload));
    return payload;
}

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/scan
//
//  Accepts JSON from hardware / mock:
//  {
//    "camera_id"  : "uuid",
//    "vehicle_no" : "DL3CAF0001",
//    "timestamp"  : "2025-02-22T15:00:00Z",   // ISO string (optional, defaults to now)
//    "confidence" : 0.94,                       // optional
//    "raw_plate"  : "DL 3C AF 0001"            // raw string from hardware (optional)
//  }
// ══════════════════════════════════════════════════════════════════════════════

export const processScan = asyncHandler(async (req, res) => {
    const { camera_id, vehicle_no, timestamp, confidence, raw_plate } = req.body;

    if (!camera_id)  throw new ApiError(StatusCodes.BAD_REQUEST, "camera_id is required");
    if (!vehicle_no) throw new ApiError(StatusCodes.BAD_REQUEST, "vehicle_no is required");

    const vehicleNo  = normalisePlate(vehicle_no);
    const rawPlate   = raw_plate || vehicleNo;
    const scanTime   = timestamp ? new Date(timestamp) : new Date();
    const confScore  = confidence ? parseFloat(confidence) : null;

    // ── 1. Verify camera ──────────────────────────────────────────────────────
    const camera = await prisma.camera.findUnique({ where: { id: camera_id } });
    if (!camera) throw new ApiError(StatusCodes.NOT_FOUND, `Camera not found: ${camera_id}`);

    // ── 2. Resolve vehicle auth (Redis → DB) ──────────────────────────────────
    const authInfo     = await resolveVehicle(vehicleNo);
    const isAuthorized = authInfo.isAuthorized;

    // ── 3. Choose behaviour by camera type ────────────────────────────────────
    // INTERIOR cameras = sighting only (no entry/exit gate logic)
    if (camera.cameraType === "INTERIOR") {
        const log = await prisma.entryExitLog.create({
            data: {
                cameraId:        camera_id,
                vehicleNo,
                logType:         "SIGHTING",
                rawPlate,
                confidence:      confScore,
                isAuthorized,
                vehicleCategory: isAuthorized ? "REGISTERED" : "UNVERIFIED",
                entryTime:       scanTime,
            },
            include: { camera: true, vehicle: true },
        });

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, {
                event:          "SIGHTING",
                vehicleNo,
                isAuthorized,
                vehicleInfo:    isAuthorized ? authInfo : null,
                camera:         { id: camera.id, location: camera.cameraLocation, type: camera.cameraType },
                log,
            }, `Vehicle ${vehicleNo} sighted at ${camera.cameraLocation}`)
        );
    }

    // ── 4. Gate camera (ENTRY / EXIT / BOTH) ─────────────────────────────────
    const activeKey     = KEY_ACTIVE(vehicleNo);
    const activeRaw     = await redis.get(activeKey);
    const activeSession = activeRaw ? JSON.parse(activeRaw) : null;

    // ── 4a. AUTHORIZED vehicle ────────────────────────────────────────────────
    if (isAuthorized) {
        if (!activeSession) {
            // ── ENTRY ──
            const log = await prisma.entryExitLog.create({
                data: {
                    cameraId:        camera_id,
                    vehicleNo,
                    logType:         "ENTRY",
                    rawPlate,
                    confidence:      confScore,
                    isAuthorized:    true,
                    vehicleCategory: "REGISTERED",
                    entryTime:       scanTime,
                },
                include: { camera: true, vehicle: true },
            });

            // Cache active session
            // Store logId + entryTime so EXIT needs zero extra DB queries
            await redis.setex(activeKey, VEHICLE_TTL, JSON.stringify({ logId: log.id, entryTime: scanTime.toISOString() }));

            return res.status(StatusCodes.OK).json(
                new ApiResponse(StatusCodes.OK, {
                    event:       "ENTRY",
                    vehicleNo,
                    isAuthorized: true,
                    vehicleInfo:  authInfo,
                    message:     "✅ Entry granted — registered vehicle",
                    camera:      { id: camera.id, location: camera.cameraLocation },
                    log,
                }, "Entry granted")
            );
        } else {
            // ── EXIT ──
            const exitTime = scanTime;

            // ── Pull logId + entryTime from Redis (no extra DB query) ──────────
            let logId     = activeSession?.logId     ?? null;
            let entryTime = activeSession?.entryTime ? new Date(activeSession.entryTime) : null;

            // ── DB fallback — Redis was flushed mid-session ───────────────────
            if (!logId || !entryTime) {
                const fallback = await prisma.entryExitLog.findFirst({
                    where:   { vehicleNo, logType: "ENTRY", exitTime: null },
                    orderBy: { entryTime: "desc" },
                });
                if (fallback) { logId = fallback.id; entryTime = fallback.entryTime; }
            }

            const duration = entryTime
                ? Math.round((exitTime - entryTime) / 1000)
                : null;

            const log = await prisma.entryExitLog.update({
                where: { id: logId },
                data: {
                    logType:         "EXIT",
                    exitTime,
                    vehicleDuration: duration,
                    cameraId:        camera_id,     // exit camera may differ from entry camera
                },
                include: { camera: true, vehicle: true },
            });

            await redis.del(activeKey);

            return res.status(StatusCodes.OK).json(
                new ApiResponse(StatusCodes.OK, {
                    event:           "EXIT",
                    vehicleNo,
                    isAuthorized:    true,
                    vehicleInfo:     authInfo,
                    vehicleDuration: duration,
                    message:         "👋 Exit recorded — registered vehicle",
                    camera:          { id: camera.id, location: camera.cameraLocation },
                    log,
                }, "Exit recorded")
            );
        }
    }

    // ── 4b. UNAUTHORIZED vehicle (cab / auto / taxi / delivery) ───────────────
    const unauthKey  = KEY_UNAUTH(vehicleNo);
    const unauthData = await redis.get(unauthKey);

    if (!unauthData && !activeSession) {
        // ── First time seen → ENTRY + start 30-min window ──
        const log = await prisma.entryExitLog.create({
            data: {
                cameraId:        camera_id,
                vehicleNo,
                logType:         "ENTRY",
                rawPlate,
                confidence:      confScore,
                isAuthorized:    false,
                vehicleCategory: "UNVERIFIED",
                entryTime:       scanTime,
            },
            include: { camera: true, vehicle: true },
        });

        const allowedUntil = new Date(scanTime.getTime() + UNAUTH_TTL * 1000).toISOString();
        await redis.setex(unauthKey, UNAUTH_TTL, JSON.stringify({ logId: log.id, entryTime: scanTime, allowedUntil }));
        await redis.setex(activeKey, UNAUTH_TTL, JSON.stringify({ logId: log.id, entryTime: scanTime.toISOString() }));
 
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, {
                event:          "ENTRY",
                vehicleNo,
                isAuthorized:   false,
                vehicleCategory: "UNVERIFIED",
                message:        "⚠️ Unverified vehicle — allowed. 30-minute stay limit applies.",
                allowedUntil,
                camera:         { id: camera.id, location: camera.cameraLocation },
                log,
            }, "Unverified vehicle entry — 30-min limit")
        );
    }

    if (unauthData) {
        // ── Vehicle seen again — check if within window ──
        const { logId, entryTime, allowedUntil } = JSON.parse(unauthData);
        const now       = new Date();
        const isOverdue = now > new Date(allowedUntil);

        // Shared by both branches
        const exitTime = scanTime;
        const duration = Math.round((exitTime - new Date(entryTime)) / 1000);

        if (isOverdue) {
            // ── OVERSTAY ALERT ──

            await prisma.entryExitLog.update({
                where: { id: logId },
                data: { logType: "EXIT", exitTime, vehicleDuration: duration },
            });
            await redis.del(unauthKey);
            await redis.del(activeKey);

            return res.status(StatusCodes.OK).json(
                new ApiResponse(StatusCodes.OK, {
                    event:            "OVERSTAY_EXIT",
                    vehicleNo,
                    isAuthorized:     false,
                    vehicleCategory:  "UNVERIFIED",
                    message:          "🚨 ALERT: Unverified vehicle overstayed 30-minute limit!",
                    allowedUntil,
                    vehicleDuration:  duration,
                    camera:           { id: camera.id, location: camera.cameraLocation },
                }, "⚠️ Unverified vehicle overstay alert")
            );
        }

        // ── Still within window → normal EXIT ──

        const log = await prisma.entryExitLog.update({
            where: { id: logId },
            data: { logType: "EXIT", exitTime, vehicleDuration: duration },
            include: { camera: true, vehicle: true },
        });
        await redis.del(unauthKey);
        await redis.del(activeKey);

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, {
                event:            "EXIT",
                vehicleNo,
                isAuthorized:     false,
                vehicleCategory:  "UNVERIFIED",
                message:          "👋 Unverified vehicle exited within allowed window.",
                vehicleDuration:  duration,
                allowedUntil,
                camera:           { id: camera.id, location: camera.cameraLocation },
                log,
            }, "Unverified vehicle exit")
        );
    }

    // Fallback — no open log, not in unauth cache
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            vehicleNo,
            isAuthorized: false,
            vehicleCategory: "UNVERIFIED",
            message: "⚠️ Unverified vehicle — no active session found.",
        }, "Unverified vehicle, no session")
    );
});


// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/scan/logs
//  Query: page, limit, authorized (true/false), from, to, cameraId, logType
// ══════════════════════════════════════════════════════════════════════════════

export const getLogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, authorized, from, to, cameraId, logType } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (authorized !== undefined)   where.isAuthorized = authorized === "true";
    if (cameraId)                   where.cameraId     = cameraId;
    if (logType)                    where.logType      = logType.toUpperCase();
    if (from || to) {
        where.entryTime = {};
        if (from) where.entryTime.gte = new Date(from);
        if (to)   where.entryTime.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
        prisma.entryExitLog.findMany({
            where,
            skip,
            take:     parseInt(limit),
            orderBy:  { entryTime: "desc" },
            include:  { camera: true, vehicle: true },
        }),
        prisma.entryExitLog.count({ where }),
    ]);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { logs, total, page: parseInt(page), limit: parseInt(limit) }, "Logs fetched")
    );
});


// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/scan/logs/active
//  Vehicles with no exit (currently on campus)
// ══════════════════════════════════════════════════════════════════════════════
export const getActiveLogs = asyncHandler(async (req, res) => {
    const logs = await prisma.entryExitLog.findMany({
        where:   { exitTime: null, logType: "ENTRY" },
        orderBy: { entryTime: "desc" },
        include: { camera: true, vehicle: true },
    });

    // Enrich unverified with remaining time from Redis
    const enriched = await Promise.all(logs.map(async (log) => {
        if (!log.isAuthorized) {
            const unauthData = await redis.get(KEY_UNAUTH(log.vehicleNo));
            if (unauthData) {
                const { allowedUntil } = JSON.parse(unauthData);
                const remaining = Math.max(0, Math.round((new Date(allowedUntil) - Date.now()) / 1000));
                return { ...log, allowedUntil, remainingSeconds: remaining, isOverdue: remaining === 0 };
            }
        }
        return log;
    }));

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { count: enriched.length, logs: enriched }, "Active vehicles fetched")
    );
});


// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/scan/logs/:vehicleNo
//  All logs for a specific plate, with optional date range
// ══════════════════════════════════════════════════════════════════════════════
export const getLogsByVehicle = asyncHandler(async (req, res) => {
    const vehicleNo = normalisePlate(req.params.vehicleNo);
    const { from, to } = req.query;

    const where = { vehicleNo };
    if (from || to) {
        where.entryTime = {};
        if (from) where.entryTime.gte = new Date(from);
        if (to)   where.entryTime.lte = new Date(to);
    }

    const logs = await prisma.entryExitLog.findMany({
        where,
        orderBy: { entryTime: "desc" },
        include: { camera: true, vehicle: true },
    });

    // Also return current Redis status
    const activeLogId = await redis.get(KEY_ACTIVE(vehicleNo));
    const unauthData  = await redis.get(KEY_UNAUTH(vehicleNo));

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            vehicleNo,
            count:          logs.length,
            logs,
            currentlyOnCampus: !!activeLogId,
            unauthStatus:   unauthData ? JSON.parse(unauthData) : null,
        }, "Vehicle logs fetched")
    );
});
