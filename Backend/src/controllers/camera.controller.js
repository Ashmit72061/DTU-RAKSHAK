import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// ── POST /api/v1/cameras ──────────────────────────────────────────────────────
export const createCamera = asyncHandler(async (req, res) => {
    const { lat, long, cameraType, cameraLocation } = req.body;

    if (!lat || !long || !cameraType || !cameraLocation) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "lat, long, cameraType, and cameraLocation are required");
    }

    const VALID_TYPES = ["ENTRY", "EXIT", "BOTH"];
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
        const VALID_TYPES = ["ENTRY", "EXIT", "BOTH"];
        if (!VALID_TYPES.includes(cameraType.toUpperCase())) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `cameraType must be one of: ${VALID_TYPES.join(", ")}`);
        }
    }

    const camera = await prisma.camera.update({
        where: { id: req.params.id },
        data: {
            ...(lat           && { lat: parseFloat(lat) }),
            ...(long          && { long: parseFloat(long) }),
            ...(cameraType    && { cameraType: cameraType.toUpperCase() }),
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
