import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import redis from "../models/redis.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { normalisePlate } from "../utils/plate.js";
import { KEY_ACTIVE, KEY_UNAUTH } from "../services/scan.service.js";
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
            confidence: confidence ? parseFloat(confidence) : null,
            model_confidence: model_confidence ? parseFloat(model_confidence) : null
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
    if (logType) where.logType = logType.toUpperCase();
    if (from || to) {
        where.entryTime = {};
        if (from) where.entryTime.gte = new Date(from);
        if (to) where.entryTime.lte = new Date(to);
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
        where: { exitTime: null, logType: "ENTRY" },
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
        if (to) where.entryTime.lte = new Date(to);
    }

    const [logs, activeRaw, unauthData] = await Promise.all([
        prisma.entryExitLog.findMany({ where, orderBy: { entryTime: "desc" }, include: { camera: true, vehicle: true } }),
        redis.get(KEY_ACTIVE(vehicleNo)),
        redis.get(KEY_UNAUTH(vehicleNo)),
    ]);

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
        vehicleNo,
        count: logs.length,
        logs,
        currentlyOnCampus: !!activeRaw,
        unauthStatus: unauthData ? JSON.parse(unauthData) : null,
    }, "Vehicle logs fetched"));
});
