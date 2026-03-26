import { StatusCodes } from "http-status-codes";
import { parse } from "csv-parse/sync";
import prisma from "../models/prisma.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
    encrypt,
    hashField,
    normalizePhone,
    normalizeVehicleNo,
    decryptVehicle,
} from "../utils/crypto.util.js";

const VEHICLE_REQUIRED   = ["name", "fathersName", "dept", "dateOfIssue", "vehicleType", "stickerNo", "vehicleNo", "mobileNo"];
const VALID_VEHICLE_TYPES = ["2W", "4W", "Heavy", "Electric"];
const MAX_LIMIT           = 50;

// ── Shared helper: build the encrypted + hashed data object for a vehicle write ──
function buildSensitiveFields(rawVehicleNo, rawMobileNo) {
    const normalVehicleNo = normalizeVehicleNo(rawVehicleNo);
    const normalMobileNo  = normalizePhone(rawMobileNo);

    return {
        vehicleNo:     JSON.stringify(encrypt(normalVehicleNo)),
        vehicleNoHash: hashField(normalVehicleNo),
        mobileNo:      JSON.stringify(encrypt(normalMobileNo)),
        mobileNoHash:  hashField(normalMobileNo),
        // Return the normalized plate too — used internally (e.g. Redis keys)
        _normalizedVehicleNo: normalVehicleNo,
    };
}

// ── POST /api/v1/vehicles ─────────────────────────────────────────────────────
export const createVehicle = asyncHandler(async (req, res) => {
    const { name, fathersName, dept, dateOfIssue, vehicleType, stickerNo, vehicleNo, mobileNo } = req.body;

    if (!name || !fathersName || !dept || !dateOfIssue || !vehicleType || !stickerNo || !vehicleNo || !mobileNo) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "All fields are required");
    }

    if (!VALID_VEHICLE_TYPES.includes(vehicleType)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Invalid vehicleType — must be one of: ${VALID_VEHICLE_TYPES.join(", ")}`);
    }

    const sensitive = buildSensitiveFields(vehicleNo, mobileNo);

    // Duplicate check via hash (vehicleNo) or stickerNo (plaintext)
    const existing = await prisma.vehicle.findFirst({
        where: { OR: [{ vehicleNoHash: sensitive.vehicleNoHash }, { stickerNo }] },
    });
    if (existing) {
        throw new ApiError(StatusCodes.CONFLICT, "Vehicle number or sticker number already registered");
    }

    const vehicle = await prisma.vehicle.create({
        data: {
            name,
            fathersName,
            dept,
            dateOfIssue:   new Date(dateOfIssue),
            vehicleType,
            stickerNo,
            vehicleNo:     sensitive.vehicleNo,
            vehicleNoHash: sensitive.vehicleNoHash,
            mobileNo:      sensitive.mobileNo,
            mobileNoHash:  sensitive.mobileNoHash,
        },
    });

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, decryptVehicle(vehicle), "Vehicle registered successfully")
    );
});

// ── GET /api/v1/vehicles ──────────────────────────────────────────────────────
export const getVehicles = asyncHandler(async (req, res) => {
    const page  = parseInt(req.query.page)  || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, MAX_LIMIT); // cap at 50
    const skip  = (page - 1) * limit;
    const { search } = req.query;

    // vehicleNo is encrypted — only name, stickerNo, dept remain searchable with LIKE.
    // For an exact vehicleNo lookup, use GET /vehicles/:vehicleNo instead.
    const where = search
        ? {
            OR: [
                { name:      { contains: search, mode: "insensitive" } },
                { stickerNo: { contains: search, mode: "insensitive" } },
                { dept:      { contains: search, mode: "insensitive" } },
            ],
        }
        : {};

    const [vehicles, total] = await Promise.all([
        prisma.vehicle.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
        prisma.vehicle.count({ where }),
    ]);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            vehicles: vehicles.map(decryptVehicle),
            total,
            page,
            limit,
        }, "Vehicles fetched")
    );
});

// ── GET /api/v1/vehicles/:vehicleNo ──────────────────────────────────────────
export const getVehicle = asyncHandler(async (req, res) => {
    const vehicleNoHash = hashField(normalizeVehicleNo(req.params.vehicleNo));

    const vehicle = await prisma.vehicle.findUnique({ where: { vehicleNoHash } });
    if (!vehicle) throw new ApiError(StatusCodes.NOT_FOUND, "Vehicle not found");

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, decryptVehicle(vehicle), "Vehicle fetched")
    );
});

// ── PUT /api/v1/vehicles/:vehicleNo ──────────────────────────────────────────
export const updateVehicle = asyncHandler(async (req, res) => {
    const vehicleNoHash = hashField(normalizeVehicleNo(req.params.vehicleNo));

    const exists = await prisma.vehicle.findUnique({ where: { vehicleNoHash } });
    if (!exists) throw new ApiError(StatusCodes.NOT_FOUND, "Vehicle not found");

    const allowed = ["name", "fathersName", "dept", "dateOfIssue", "vehicleType", "stickerNo", "mobileNo"];
    const data = {};

    for (const key of allowed) {
        if (req.body[key] === undefined) continue;

        if (key === "dateOfIssue") {
            data.dateOfIssue = new Date(req.body[key]);
        } else if (key === "mobileNo") {
            // Re-encrypt and rehash if phone number is being updated
            const normalMobileNo  = normalizePhone(req.body.mobileNo);
            data.mobileNo     = JSON.stringify(encrypt(normalMobileNo));
            data.mobileNoHash = hashField(normalMobileNo);
        } else {
            data[key] = req.body[key];
        }
    }

    const vehicle = await prisma.vehicle.update({ where: { vehicleNoHash }, data });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, decryptVehicle(vehicle), "Vehicle updated successfully")
    );
});

// ── DELETE /api/v1/vehicles/:vehicleNo ────────────────────────────────────────
export const deleteVehicle = asyncHandler(async (req, res) => {
    const vehicleNoHash = hashField(normalizeVehicleNo(req.params.vehicleNo));

    const exists = await prisma.vehicle.findUnique({ where: { vehicleNoHash } });
    if (!exists) throw new ApiError(StatusCodes.NOT_FOUND, "Vehicle not found");

    await prisma.vehicle.delete({ where: { vehicleNoHash } });

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

    const errors       = [];
    const validRecords = [];
    const seenHashes   = new Set(); // intra-file duplicate detection via hash

    for (let i = 0; i < rows.length; i++) {
        const row    = rows[i];
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

        // --- date validation ---
        const dateOfIssue = new Date(row.dateOfIssue);
        if (isNaN(dateOfIssue.getTime())) {
            errors.push({ row: rowNum, reason: `Invalid dateOfIssue "${row.dateOfIssue}" — use YYYY-MM-DD format` });
            continue;
        }

        // --- normalise + hash + encrypt sensitive fields ---
        const sensitive = buildSensitiveFields(row.vehicleNo.trim(), row.mobileNo.trim());

        // --- intra-file duplicate check (by hash) ---
        if (seenHashes.has(sensitive.vehicleNoHash)) {
            errors.push({ row: rowNum, reason: `Duplicate vehicleNo "${sensitive._normalizedVehicleNo}" within the uploaded file` });
            continue;
        }
        seenHashes.add(sensitive.vehicleNoHash);

        validRecords.push({
            name:          row.name.trim(),
            fathersName:   row.fathersName.trim(),
            dept:          row.dept.trim(),
            dateOfIssue,
            vehicleType:   row.vehicleType.trim(),
            stickerNo:     row.stickerNo.trim(),
            vehicleNo:     sensitive.vehicleNo,
            vehicleNoHash: sensitive.vehicleNoHash,
            mobileNo:      sensitive.mobileNo,
            mobileNoHash:  sensitive.mobileNoHash,
        });
    }

    // skipDuplicates guards against vehicleNoHash or stickerNo collisions with existing DB rows
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
