import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import redis from "../models/redis.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { normalisePlate } from "../utils/plate.js";
import {
    KEY_ACTIVE, KEY_UNAUTH,
    resolveVehicle,
    handleSighting,
    handleAuthEntry, handleAuthExit,
    handleUnauthEntry, handleUnauthRescan,
} from "../services/scan.service.js";

//  POST /api/v1/scan
//  Accepts JSON from hardware / mock:
//  {
//    "camera_id"  : "uuid",
//    "vehicle_no" : "DL3CAF0001",
//    "timestamp"  : "2025-02-22T15:00:00Z",   // optional, defaults to now
//    "confidence" : 0.94,                       // optional
//    "raw_plate"  : "DL 3C AF 0001"            // raw string from hardware (optional)
//  }
export const processScan = asyncHandler(async (req, res) => {
    const { camera_id, vehicle_no, timestamp, confidence, raw_plate } = req.body;

    if (!camera_id)  throw new ApiError(StatusCodes.BAD_REQUEST, "camera_id is required");
    if (!vehicle_no) throw new ApiError(StatusCodes.BAD_REQUEST, "vehicle_no is required");

    const vehicleNo = normalisePlate(vehicle_no);
    const rawPlate  = raw_plate || vehicleNo;
    const scanTime  = timestamp ? new Date(timestamp) : new Date();
    const confScore = confidence ? parseFloat(confidence) : null;

    // 1. Verify camera exists
    const camera = await prisma.camera.findUnique({ where: { id: camera_id } });
    if (!camera) throw new ApiError(StatusCodes.NOT_FOUND, `Camera not found: ${camera_id}`);

    // 2. Resolve vehicle auth (Redis → DB)
    const authInfo     = await resolveVehicle(vehicleNo);
    const isAuthorized = authInfo.isAuthorized;

    const ctx = { res, camera, vehicleNo, rawPlate, confScore, isAuthorized, authInfo, scanTime, camera_id };

    // 3. INTERIOR camera → sighting only, no gate logic
    if (camera.cameraType === "INTERIOR") return handleSighting(ctx);

    // 4. Gate camera — check active session
    const activeKey     = KEY_ACTIVE(vehicleNo);
    const activeRaw     = await redis.get(activeKey);
    const activeSession = activeRaw ? JSON.parse(activeRaw) : null;

    // 4a. Authorized vehicle
    if (isAuthorized) {
        return activeSession
            ? handleAuthExit({ ...ctx, activeKey, activeSession })
            : handleAuthEntry({ ...ctx, activeKey });
    }

    // 4b. Unauthorized vehicle
    const unauthKey  = KEY_UNAUTH(vehicleNo);
    const unauthData = await redis.get(unauthKey);

    if (unauthData)                    return handleUnauthRescan({ ...ctx, unauthData, unauthKey, activeKey });
    if (!unauthData && !activeSession) return handleUnauthEntry({ ...ctx, unauthKey, activeKey });

    // Fallback — edge case: unauth vehicle with stale activeSession but no unauthKey
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
        vehicleNo,
        isAuthorized:    false,
        vehicleCategory: "UNVERIFIED",
        message:         "⚠️ Unverified vehicle — no active session found.",
    }, "Unverified vehicle, no session"));
});


//  GET /api/v1/scan/logs
//  Query: page, limit, authorized (true/false), from, to, cameraId, logType
export const getLogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, authorized, from, to, cameraId, logType } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (authorized !== undefined) where.isAuthorized = authorized === "true";
    if (cameraId)                 where.cameraId     = cameraId;
    if (logType)                  where.logType      = logType.toUpperCase();
    if (from || to) {
        where.entryTime = {};
        if (from) where.entryTime.gte = new Date(from);
        if (to)   where.entryTime.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
        prisma.entryExitLog.findMany({ where, skip, take: parseInt(limit), orderBy: { entryTime: "desc" }, include: { camera: true, vehicle: true } }),
        prisma.entryExitLog.count({ where }),
    ]);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { logs, total, page: parseInt(page), limit: parseInt(limit) }, "Logs fetched")
    );
});


//  GET /api/v1/scan/logs/active
//  Vehicles currently on campus (no exit logged yet)
export const getActiveLogs = asyncHandler(async (req, res) => {
    const logs = await prisma.entryExitLog.findMany({
        where:   { exitTime: null, logType: "ENTRY" },
        orderBy: { entryTime: "desc" },
        include: { camera: true, vehicle: true },
    });

    // Enrich unverified logs with remaining allowed time from Redis
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


//  GET /api/v1/scan/logs/:vehicleNo
//  All logs for a specific plate, with optional date range
export const getLogsByVehicle = asyncHandler(async (req, res) => {
    const vehicleNo = normalisePlate(req.params.vehicleNo);
    const { from, to } = req.query;

    const where = { vehicleNo };
    if (from || to) {
        where.entryTime = {};
        if (from) where.entryTime.gte = new Date(from);
        if (to)   where.entryTime.lte = new Date(to);
    }

    const [logs, activeRaw, unauthData] = await Promise.all([
        prisma.entryExitLog.findMany({ where, orderBy: { entryTime: "desc" }, include: { camera: true, vehicle: true } }),
        redis.get(KEY_ACTIVE(vehicleNo)),
        redis.get(KEY_UNAUTH(vehicleNo)),
    ]);

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
        vehicleNo,
        count:             logs.length,
        logs,
        currentlyOnCampus: !!activeRaw,
        unauthStatus:      unauthData ? JSON.parse(unauthData) : null,
    }, "Vehicle logs fetched"));
});
