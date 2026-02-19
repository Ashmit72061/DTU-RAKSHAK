import { StatusCodes } from "http-status-codes";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { verifyToken } from "../utils/token.util.js";
import env from "../configs/env.config.js";
import prisma from "../models/prisma.js";

/**
 * Middleware to verify JWT access token from:
 *   1. Authorization: Bearer <token> header
 *   2. access_token cookie
 *
 * Attaches the authenticated user (without password & refreshToken) to req.user.
 */
const verifyJWT = asyncHandler(async (req, _res, next) => {
    const token =
        req.cookies?.access_token ||
        req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Access token is required");
    }

    let decoded;
    try {
        decoded = verifyToken(token, env.accessTokenSecret);
    } catch {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid or expired access token");
    }

    const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
            id: true,
            email: true,
            isVerified: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!user) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "User not found");
    }

    req.user = user;
    next();
});

export default verifyJWT;
