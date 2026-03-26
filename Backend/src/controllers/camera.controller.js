import { StatusCodes } from "http-status-codes";
import { parse } from "csv-parse/sync";
import prisma from "../models/prisma.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const VALID_CAMERA_TYPES = ["ENTRY", "EXIT", "INTERIOR"];

// ── POST /api/v1/cameras ──────────────────────────────────────────────────────
export const createCamera = asyncHandler(async (req, res) => {
    const { lat, long, cameraType, cameraLocation } = req.body;

    if (!lat || !long || !cameraType || !cameraLocation) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "lat, long, cameraType, and cameraLocation are required");
    }

    const VALID_TYPES = ["ENTRY", "EXIT", "INTERIOR"];
    if (!VALID_TYPES.includes(cameraType.toUpperCase())) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `cameraType must be one of: ${VALID_TYPES.join(", ")}`);
    }

    const camera = await prisma.camera.create({
        data: {
            lat: parseFloat(lat),
            long: parseFloat(long),
            cameraType: cameraType.toUpperCase(),
            cameraLocation,
        },
    });

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, camera, "Camera registered successfully")
    );
});

// ── GET /api/v1/cameras ───────────────────────────────────────────────────────
export const getCameras = asyncHandler(async (req, res) => {
    const cameras = await prisma.camera.findMany({ orderBy: { createdAt: "desc" } });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, cameras, "Cameras fetched")
    );
});

// ── GET /api/v1/cameras/:id ───────────────────────────────────────────────────
export const getCamera = asyncHandler(async (req, res) => {
    const camera = await prisma.camera.findUnique({ where: { id: req.params.id } });
    if (!camera) throw new ApiError(StatusCodes.NOT_FOUND, "Camera not found");

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, camera, "Camera fetched")
    );
});

// ── PUT /api/v1/cameras/:id ───────────────────────────────────────────────────
export const updateCamera = asyncHandler(async (req, res) => {
    const exists = await prisma.camera.findUnique({ where: { id: req.params.id } });
    if (!exists) throw new ApiError(StatusCodes.NOT_FOUND, "Camera not found");

    const { lat, long, cameraType, cameraLocation } = req.body;

    if (cameraType) {
        const VALID_TYPES = ["ENTRY", "EXIT", "INTERIOR"];
        if (!VALID_TYPES.includes(cameraType.toUpperCase())) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `cameraType must be one of: ${VALID_TYPES.join(", ")}`);
        }
    }

    const camera = await prisma.camera.update({
        where: { id: req.params.id },
        data: {
            ...(lat && { lat: parseFloat(lat) }),
            ...(long && { long: parseFloat(long) }),
            ...(cameraType && { cameraType: cameraType.toUpperCase() }),
            ...(cameraLocation && { cameraLocation }),
        },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, camera, "Camera updated successfully")
    );
});

// ── DELETE /api/v1/cameras/:id ────────────────────────────────────────────────
export const deleteCamera = asyncHandler(async (req, res) => {
    const exists = await prisma.camera.findUnique({ where: { id: req.params.id } });
    if (!exists) throw new ApiError(StatusCodes.NOT_FOUND, "Camera not found");

    await prisma.camera.delete({ where: { id: req.params.id } });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, null, "Camera deleted successfully")
    );
});

// ── POST /api/v1/cameras/bulk ─────────────────────────────────────────────────
export const bulkImportCameras = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "CSV file is required");
    }

    let rows;
    try {
        rows = parse(req.file.buffer, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
    } catch {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid CSV format — could not parse file");
    }

    if (rows.length === 0) {
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { inserted: 0, skipped: 0, errors: [] }, "CSV was empty — nothing to import")
        );
    }

    const errors = [];
    const validRecords = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        // --- required field check ---
        const missing = ["lat", "long", "cameraType", "cameraLocation"].filter(f => !row[f]?.trim());
        if (missing.length) {
            errors.push({ row: rowNum, reason: `Missing required fields: ${missing.join(", ")}` });
            continue;
        }

        // --- numeric validation ---
        const lat = parseFloat(row.lat);
        const long = parseFloat(row.long);
        if (isNaN(lat) || isNaN(long)) {
            errors.push({ row: rowNum, reason: `lat and long must be valid numbers` });
            continue;
        }

        // --- cameraType enum validation ---
        const cameraType = row.cameraType.toUpperCase().trim();
        if (!VALID_CAMERA_TYPES.includes(cameraType)) {
            errors.push({ row: rowNum, reason: `Invalid cameraType "${row.cameraType}" — must be one of: ${VALID_CAMERA_TYPES.join(", ")}` });
            continue;
        }

        validRecords.push({
            lat,
            long,
            cameraType,
            cameraLocation: row.cameraLocation.trim(),
        });
    }

    const result = await prisma.camera.createMany({
        data: validRecords,
        skipDuplicates: true,
    });

    const skipped = validRecords.length - result.count;

    return res.status(StatusCodes.OK).json(
        new ApiResponse(
            StatusCodes.OK,
            { inserted: result.count, skipped, errors },
            `Bulk import complete: ${result.count} inserted, ${skipped} skipped, ${errors.length} errors`
        )
    );
});
