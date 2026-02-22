import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { detectNumberPlate, parsePlate } from "../services/ai.service.js";

// ── POST /api/v1/scan ─────────────────────────────────────────────────────────
// Body: multipart/form-data — image (file) + camera_id (string)
//
// Logic:
//   1. Forward image + camera_id to Flask AI service
//   2. Parse raw OCR → clean plate number
//   3. Check if plate is in Vehicle table (isAuthorized)
//   4. Find open entry log for this plate:
//        – none found  → ENTRY: create new log
//        – found       → EXIT:  update log with exitTime + vehicleDuration
// ─────────────────────────────────────────────────────────────────────────────
export const scanPlate = asyncHandler(async (req, res) => {
    const { camera_id } = req.body;

    if (!req.file) throw new ApiError(StatusCodes.BAD_REQUEST, "Image file is required (field: 'image')");
    if (!camera_id) throw new ApiError(StatusCodes.BAD_REQUEST, "camera_id is required");

    // Verify camera exists
    const camera = await prisma.camera.findUnique({ where: { id: camera_id } });
    if (!camera) throw new ApiError(StatusCodes.NOT_FOUND, `Camera not found: ${camera_id}`);

    // ── Call Flask AI service ─────────────────────────────────────────────────
    const aiResult = await detectNumberPlate(req.file.buffer, req.file.originalname, camera_id);

    if (!aiResult.plates || aiResult.plates.length === 0) {
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { detected: false, camera_id, timestamp: aiResult.timestamp }, "No plate detected in image")
        );
    }

    // Process each detected plate (usually 1)
    const logs = [];
    for (const plateData of aiResult.plates) {
        const { plate: vehicleNo, valid, raw_ocr } = plateData;

        // ── Check authorization ───────────────────────────────────────────────
        const registeredVehicle = await prisma.vehicle.findUnique({ where: { vehicleNo } });
        const isAuthorized = !!registeredVehicle;

        // ── Find open entry log ───────────────────────────────────────────────
        const openLog = await prisma.entryExitLog.findFirst({
            where: { vehicleNo, exitTime: null },
            orderBy: { entryTime: "desc" },
        });

        let log;

        if (!openLog) {
            // ── ENTRY ─────────────────────────────────────────────────────────
            log = await prisma.entryExitLog.create({
                data: {
                    cameraId:     camera_id,
                    vehicleNo,
                    rawOcr:       raw_ocr,
                    isAuthorized,
                    entryTime:    new Date(aiResult.timestamp),
                },
                include: { camera: true, vehicle: true },
            });
        } else {
            // ── EXIT ──────────────────────────────────────────────────────────
            const exitTime = new Date(aiResult.timestamp);
            const vehicleDuration = Math.round((exitTime - openLog.entryTime) / 1000); // seconds

            log = await prisma.entryExitLog.update({
                where: { id: openLog.id },
                data:  { exitTime, vehicleDuration },
                include: { camera: true, vehicle: true },
            });
        }

        logs.push({ ...log, event: openLog ? "EXIT" : "ENTRY" });
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { detected: true, logs }, "Scan processed successfully")
    );
});

// ── GET /api/v1/scan/logs ─────────────────────────────────────────────────────
// All logs, paginated. Optional ?authorized=true/false
export const getLogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, authorized } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = authorized !== undefined
        ? { isAuthorized: authorized === "true" }
        : {};

    const [logs, total] = await Promise.all([
        prisma.entryExitLog.findMany({
            where,
            skip,
            take: parseInt(limit),
            orderBy: { entryTime: "desc" },
            include: { camera: true, vehicle: true },
        }),
        prisma.entryExitLog.count({ where }),
    ]);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { logs, total, page: parseInt(page), limit: parseInt(limit) }, "Logs fetched")
    );
});

// ── GET /api/v1/scan/logs/active ──────────────────────────────────────────────
// Vehicles currently inside campus (entry with no exit)
export const getActiveLogs = asyncHandler(async (req, res) => {
    const logs = await prisma.entryExitLog.findMany({
        where: { exitTime: null },
        orderBy: { entryTime: "desc" },
        include: { camera: true, vehicle: true },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { count: logs.length, logs }, "Active vehicles fetched")
    );
});

// ── GET /api/v1/scan/logs/:vehicleNo ──────────────────────────────────────────
// All logs for a specific vehicle
export const getLogsByVehicle = asyncHandler(async (req, res) => {
    const vehicleNo = req.params.vehicleNo.toUpperCase().replace(/\s/g, "");

    const logs = await prisma.entryExitLog.findMany({
        where: { vehicleNo },
        orderBy: { entryTime: "desc" },
        include: { camera: true, vehicle: true },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { vehicleNo, count: logs.length, logs }, "Vehicle logs fetched")
    );
});
