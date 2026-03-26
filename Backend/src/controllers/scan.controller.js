import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import redis from "../models/redis.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { normalisePlate } from "../utils/plate.js";
import { hashField, decryptVehicle } from "../utils/crypto.util.js";
import { KEY_ACTIVE } from "../services/scan.service.js";
import { scanQueue } from "../utils/queue.js";
import crypto from "crypto";

//  POST /api/v1/scan
export const processScan = asyncHandler(async (req, res) => {
    const { camera_id, vehicle_no, timestamp, confidence, model_confidence, raw_plate } = req.body;

    if (!camera_id) throw new ApiError(StatusCodes.BAD_REQUEST, "camera_id is required");
    if (!vehicle_no) throw new ApiError(StatusCodes.BAD_REQUEST, "vehicle_no is required");

    const vehicleNo = normalisePlate(vehicle_no);
    const rawPlate = raw_plate || vehicle_no;
    const scanTime = timestamp ? new Date(timestamp) : new Date();

    const hashStr = `${camera_id}-${vehicleNo}-${scanTime.toISOString()}`;
    const jobId = crypto.createHash("md5").update(hashStr).digest("hex");

    await scanQueue.add(
        "processScanJob", 
        {
            camera_id,
            vehicleNo,
            rawPlate,
            scanTime,
            ocrConfidence: confidence ? parseFloat(confidence) : null,
            modelConfidence: model_confidence ? parseFloat(model_confidence) : null
        }, 
        { jobId }
    );

    return res.status(StatusCodes.ACCEPTED).json(
        new ApiResponse(StatusCodes.ACCEPTED, { vehicleNo }, "Scan queued for processing")
    );
});


//  GET /api/v1/scan/logs
//  Query: page, limit, authorized (true/false), from, to, cameraId, logType
export const getLogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, authorized, from, to, cameraId, logType } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (authorized !== undefined) where.isAuthorized = authorized === "true";
    if (cameraId) where.cameraId = cameraId;
    if (logType)  where.logType  = logType.toUpperCase();
    if (from || to) {
        where.entryTime = {};
        if (from) where.entryTime.gte = new Date(from);
        if (to)   where.entryTime.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
        prisma.entryExitLog.findMany({
            where,
            skip,
            take:    parseInt(limit),
            orderBy: { entryTime: "desc" },
            include: { camera: true, vehicle: true },
        }),
        prisma.entryExitLog.count({ where }),
    ]);

    // Decrypt vehicle relation fields if present; strip hash fields from response
    const safeLogs = logs.map(log => ({
        ...log,
        vehicle: log.vehicle ? decryptVehicle(log.vehicle) : null,
    }));

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { logs: safeLogs, total, page: parseInt(page), limit: parseInt(limit) }, "Logs fetched")
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

    // Enrich unverified logs with remaining allowed time via math on activeSession
    const enriched = await Promise.all(logs.map(async (log) => {
        const safeLog = { ...log, vehicle: log.vehicle ? decryptVehicle(log.vehicle) : null };

        if (!log.isAuthorized) {
            const activeRaw = await redis.get(KEY_ACTIVE(log.vehicleNo));
            if (activeRaw) {
                const { entryTime } = JSON.parse(activeRaw);
                const elapsed   = Math.round((Date.now() - new Date(entryTime)) / 1000);
                const remaining = Math.max(0, 1800 - elapsed);
                const allowedUntil = new Date(new Date(entryTime).getTime() + 1800 * 1000).toISOString();
                return { ...safeLog, allowedUntil, remainingSeconds: remaining, isOverdue: elapsed > 1800 };
            }
        }
        return safeLog;
    }));

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { count: enriched.length, logs: enriched }, "Active vehicles fetched")
    );
});


//  GET /api/v1/scan/logs/:vehicleNo
//  All logs for a specific plate, with optional date range
export const getLogsByVehicle = asyncHandler(async (req, res) => {
    const vehicleNo     = normalisePlate(req.params.vehicleNo);
    const vehicleNoHash = hashField(vehicleNo); // use hash for DB query
    const { from, to }  = req.query;

    // Search logs by hash — vehicleNo in logs is kept as raw (audit), hash is for queries
    const where = { vehicleNoHash };
    if (from || to) {
        where.entryTime = {};
        if (from) where.entryTime.gte = new Date(from);
        if (to)   where.entryTime.lte = new Date(to);
    }

    const [logs, activeRaw, unauthData] = await Promise.all([
        prisma.entryExitLog.findMany({
            where,
            orderBy: { entryTime: "desc" },
            include: { camera: true, vehicle: true },
        }),
        redis.get(KEY_ACTIVE(vehicleNo)),
        redis.get(KEY_UNAUTH(vehicleNo)),
    ]);

    const safeLogs = logs.map(log => ({
        ...log,
        vehicle: log.vehicle ? decryptVehicle(log.vehicle) : null,
    }));

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
        vehicleNo,
        count:            safeLogs.length,
        logs:             safeLogs,
        currentlyOnCampus: !!activeRaw,
        unauthStatus:     unauthData ? JSON.parse(unauthData) : null,
    }, "Vehicle logs fetched"));
});

//  GET /api/v1/scan/entry-path/:entryId
//  Fetch tracking path for a specific entry session
export const getEntryPath = asyncHandler(async (req, res) => {
    const { entryId } = req.params;
    if (!entryId) throw new ApiError(StatusCodes.BAD_REQUEST, "entryId is required");

    const cacheKey = `entryPath:v2:${entryId}`;
    const cachedPath = await redis.get(cacheKey);
    
    // Check Redis cache
    if (cachedPath) {
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { entryId, path: JSON.parse(cachedPath) }, "Path fetched from cache")
        );
    }

    // Fetch EntryExitLog and its sightings ordered by timestamp ascending
    const entryObj = await prisma.entryExitLog.findUnique({
        where: { id: entryId },
        include: { 
            camera: true,
            sightings: {
                orderBy: { timestamp: 'asc' },
                include: { camera: true }
            }
        }
    });

    if (!entryObj) {
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { entryId, path: [] }, "No path data found")
        );
    }

    const path = [];
    let lastCameraId = null;

    // 1. Add the initial entry node if possible
    if (entryObj.camera && entryObj.logType === "ENTRY") {
        path.push({
            lat: entryObj.camera.lat,
            lng: entryObj.camera.long,
            timestamp: entryObj.entryTime,
            cameraId: entryObj.cameraId,
            cameraLocation: entryObj.camera.cameraLocation,
            type: "ENTRY"
        });
        lastCameraId = entryObj.cameraId;
    }

    // 2. Append all interior sightings
    for (const s of entryObj.sightings) {
        if (!s.camera) continue;
        
        path.push({
            lat: s.camera.lat,
            lng: s.camera.long,
            timestamp: s.timestamp,
            cameraId: s.cameraId,
            cameraLocation: s.camera.cameraLocation,
            type: "SIGHTING"
        });
        
        lastCameraId = s.cameraId;
    }

    // 3. If it's an EXIT log, the primary camera is actually the Exit Gate!
    if (entryObj.logType === "EXIT" && entryObj.camera) {
        if (entryObj.cameraId !== lastCameraId) {
            path.push({
                lat: entryObj.camera.lat,
                lng: entryObj.camera.long,
                timestamp: entryObj.exitTime || entryObj.entryTime,
                cameraId: entryObj.cameraId,
                cameraLocation: entryObj.camera.cameraLocation,
                type: "EXIT"
            });
        } else {
            // Overrode last sighting camera with exit status
            if (path.length > 0) {
                path[path.length - 1].type = "EXIT";
                path[path.length - 1].timestamp = entryObj.exitTime || path[path.length - 1].timestamp;
            }
        }
    }

    // Cache the result for 10 minutes (600 seconds)
    await redis.setex(cacheKey, 600, JSON.stringify(path));

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { entryId, path }, "Path fetched from Database")
    );
});
