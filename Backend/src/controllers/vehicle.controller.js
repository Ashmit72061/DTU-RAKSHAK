import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// ── POST /api/v1/vehicles ─────────────────────────────────────────────────────
export const createVehicle = asyncHandler(async (req, res) => {
    const { name, fathersName, dept, dateOfIssue, vehicleType, stickerNo, vehicleNo, mobileNo } = req.body;

    if (!name || !fathersName || !dept || !dateOfIssue || !vehicleType || !stickerNo || !vehicleNo || !mobileNo) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "All fields are required");
    }

    const existing = await prisma.vehicle.findFirst({
        where: { OR: [{ vehicleNo: vehicleNo.toUpperCase().replace(/\s/g, "") }, { stickerNo }] },
    });
    if (existing) {
        throw new ApiError(StatusCodes.CONFLICT, "Vehicle number or sticker number already registered");
    }

    const vehicle = await prisma.vehicle.create({
        data: {
            name,
            fathersName,
            dept,
            dateOfIssue: new Date(dateOfIssue),
            vehicleType,
            stickerNo,
            vehicleNo: vehicleNo.toUpperCase().replace(/\s/g, ""),
            mobileNo,
        },
    });

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, vehicle, "Vehicle registered successfully")
    );
});

// ── GET /api/v1/vehicles ──────────────────────────────────────────────────────
export const getVehicles = asyncHandler(async (req, res) => {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search
        ? {
              OR: [
                  { vehicleNo:   { contains: search.toUpperCase() } },
                  { name:        { contains: search, mode: "insensitive" } },
                  { stickerNo:   { contains: search, mode: "insensitive" } },
                  { dept:        { contains: search, mode: "insensitive" } },
              ],
          }
        : {};

    const [vehicles, total] = await Promise.all([
        prisma.vehicle.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt: "desc" } }),
        prisma.vehicle.count({ where }),
    ]);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { vehicles, total, page: parseInt(page), limit: parseInt(limit) }, "Vehicles fetched")
    );
});

// ── GET /api/v1/vehicles/:vehicleNo ──────────────────────────────────────────
export const getVehicle = asyncHandler(async (req, res) => {
    const vehicleNo = req.params.vehicleNo.toUpperCase().replace(/\s/g, "");

    const vehicle = await prisma.vehicle.findUnique({ where: { vehicleNo } });
    if (!vehicle) throw new ApiError(StatusCodes.NOT_FOUND, "Vehicle not found");

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, vehicle, "Vehicle fetched")
    );
});

// ── PUT /api/v1/vehicles/:vehicleNo ──────────────────────────────────────────
export const updateVehicle = asyncHandler(async (req, res) => {
    const vehicleNo = req.params.vehicleNo.toUpperCase().replace(/\s/g, "");

    const exists = await prisma.vehicle.findUnique({ where: { vehicleNo } });
    if (!exists) throw new ApiError(StatusCodes.NOT_FOUND, "Vehicle not found");

    const allowed = ["name", "fathersName", "dept", "dateOfIssue", "vehicleType", "stickerNo", "mobileNo"];
    const data = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined) {
            data[key] = key === "dateOfIssue" ? new Date(req.body[key]) : req.body[key];
        }
    }

    const vehicle = await prisma.vehicle.update({ where: { vehicleNo }, data });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, vehicle, "Vehicle updated successfully")
    );
});

// ── DELETE /api/v1/vehicles/:vehicleNo ────────────────────────────────────────
export const deleteVehicle = asyncHandler(async (req, res) => {
    const vehicleNo = req.params.vehicleNo.toUpperCase().replace(/\s/g, "");

    const exists = await prisma.vehicle.findUnique({ where: { vehicleNo } });
    if (!exists) throw new ApiError(StatusCodes.NOT_FOUND, "Vehicle not found");

    await prisma.vehicle.delete({ where: { vehicleNo } });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, null, "Vehicle deleted successfully")
    );
});
