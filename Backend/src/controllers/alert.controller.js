import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const MAX_LIMIT = 50;

// ── GET /api/v1/alerts ────────────────────────────────────────────────────────
export const getAlerts = asyncHandler(async (req, res) => {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = Math.min(parseInt(req.query.limit) || 20, MAX_LIMIT);
    const skip   = (page - 1) * limit;
    const { status, alertType } = req.query;

    const where = {};
    if (status)    where.status    = status;
    if (alertType) where.alertType = alertType;

    const [alerts, total] = await Promise.all([
        prisma.alert.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: { camera: { select: { id: true, cameraLocation: true, cameraType: true } } }
        }),
        prisma.alert.count({ where }),
    ]);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { alerts, total, page, limit }, "Alerts fetched")
    );
});

// ── PATCH /api/v1/alerts/:id/acknowledge ─────────────────────────────────────
export const acknowledgeAlert = asyncHandler(async (req, res) => {
    const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!alert) throw new ApiError(StatusCodes.NOT_FOUND, "Alert not found");
    if (alert.status !== "OPEN") throw new ApiError(StatusCodes.CONFLICT, "Alert is not OPEN");

    const updated = await prisma.alert.update({
        where: { id: req.params.id },
        data: { status: "ACKNOWLEDGED" }
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, updated, "Alert acknowledged")
    );
});

// ── PATCH /api/v1/alerts/:id/resolve ─────────────────────────────────────────
export const resolveAlert = asyncHandler(async (req, res) => {
    const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!alert) throw new ApiError(StatusCodes.NOT_FOUND, "Alert not found");
    if (alert.status === "RESOLVED") throw new ApiError(StatusCodes.CONFLICT, "Alert already resolved");

    const updated = await prisma.alert.update({
        where: { id: req.params.id },
        data: { status: "RESOLVED", resolvedBy: req.user?.id ?? null, resolvedAt: new Date() }
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, updated, "Alert resolved")
    );
});
