import prisma from "../models/prisma.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

export const registerToken = asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) throw new ApiError(400, "token is required");

    await prisma.deviceToken.upsert({
        where: { token },
        update: { updatedAt: new Date() },
        create: { token, userId: req.user?.id ?? null },
    });

    return res.status(200).json(new ApiResponse(200, null, "Token registered"));
});