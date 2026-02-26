import { StatusCodes } from "http-status-codes";
import { parse } from "csv-parse/sync";
import prisma from "../models/prisma.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const VEHICLE_REQUIRED = ["name", "fathersName", "dept", "dateOfIssue", "vehicleType", "stickerNo", "vehicleNo", "mobileNo"];
const VALID_VEHICLE_TYPES = ["2W", "4W", "Heavy", "Electric"];

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
                { vehicleNo: { contains: search.toUpperCase() } },
                { name: { contains: search, mode: "insensitive" } },
                { stickerNo: { contains: search, mode: "insensitive" } },
                { dept: { contains: search, mode: "insensitive" } },
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

// ── POST /api/v1/vehicles/bulk ────────────────────────────────────────────────
export const bulkImportVehicles = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "CSV file is required");
    }

    let rows;
    try {
        rows = parse(req.file.buffer, {
            columns: true,           // use first row as column names
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
    const seen = new Set(); // track duplicates within this upload

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2: 1-indexed + header row

        // --- required field check ---
        const missing = VEHICLE_REQUIRED.filter(f => !row[f]?.trim());
        if (missing.length) {
            errors.push({ row: rowNum, reason: `Missing required fields: ${missing.join(", ")}` });
            continue;
        }

        // --- vehicle type validation ---
        if (!VALID_VEHICLE_TYPES.includes(row.vehicleType.trim())) {
            errors.push({ row: rowNum, reason: `Invalid vehicleType "${row.vehicleType}" — must be one of: ${VALID_VEHICLE_TYPES.join(", ")}` });
            continue;
        }

        // --- normalise vehicleNo ---
        const vehicleNo = row.vehicleNo.toUpperCase().replace(/\s/g, "");

        // --- intra-file duplicate check ---
        if (seen.has(vehicleNo)) {
            errors.push({ row: rowNum, reason: `Duplicate vehicleNo "${vehicleNo}" within the uploaded file` });
            continue;
        }
        seen.add(vehicleNo);

        // --- date validation ---
        const dateOfIssue = new Date(row.dateOfIssue);
        if (isNaN(dateOfIssue.getTime())) {
            errors.push({ row: rowNum, reason: `Invalid dateOfIssue "${row.dateOfIssue}" — use YYYY-MM-DD format` });
            continue;
        }

        validRecords.push({
            name: row.name.trim(),
            fathersName: row.fathersName.trim(),
            dept: row.dept.trim(),
            dateOfIssue,
            vehicleType: row.vehicleType.trim(),
            stickerNo: row.stickerNo.trim(),
            vehicleNo,
            mobileNo: row.mobileNo.trim(),
        });
    }

    // --- bulk insert (DB-level duplicates are silently skipped) ---
    const result = await prisma.vehicle.createMany({
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
