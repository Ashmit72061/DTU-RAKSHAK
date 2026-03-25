import bcrypt from "bcrypt";
import { StatusCodes } from "http-status-codes";
import prisma from "../models/prisma.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { generateOtp, verifyOtp } from "../utils/otp.util.js";
import {
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
} from "../utils/token.util.js";
import { sendOtpEmail } from "../services/email.service.js";
import env from "../configs/env.config.js";

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const SALT_ROUNDS = 10;

const COOKIE_OPTIONS = Object.freeze({
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
});

// ────────────────────────────────────────────────────────────────
// Helper: generate both tokens, persist refresh token in DB
// ────────────────────────────────────────────────────────────────

const generateTokensAndPersist = async (user) => {
    const accessToken = generateAccessToken({ id: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ id: user.id });

    await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken },
    });

    return { accessToken, refreshToken };
};

// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/signup
// ────────────────────────────────────────────────────────────────

export const signup = asyncHandler(async (req, res) => {
    const { password } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !password) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Email and password are required");
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser && existingUser.isVerified) {
        throw new ApiError(StatusCodes.CONFLICT, "An account with this email already exists");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Upsert: create new user or update unverified user's password
    await prisma.user.upsert({
        where: { email },
        update: { password: hashedPassword },
        create: { email, password: hashedPassword },
    });

    // Generate OTP and send via email
    const otp = await generateOtp(email, "SIGNUP");
    await sendOtpEmail(email, otp, "SIGNUP");

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, { email }, "OTP sent to your email. Please verify to complete signup.")
    );
});

// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/signup/verify-otp
// ────────────────────────────────────────────────────────────────

export const verifySignupOtp = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !otp) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Email and OTP are required");
    }

    const isValid = await verifyOtp(email, otp, "SIGNUP");

    if (!isValid) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid or expired OTP");
    }

    // Mark user as verified
    const user = await prisma.user.update({
        where: { email },
        data: { isVerified: true },
    });

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokensAndPersist(user);

    return res
        .status(StatusCodes.OK)
        .cookie("refresh_token", refreshToken, COOKIE_OPTIONS)
        .json(
            new ApiResponse(StatusCodes.OK, { accessToken, email: user.email }, "Email verified successfully")
        );
});

// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/signin
// ────────────────────────────────────────────────────────────────

export const signin = asyncHandler(async (req, res) => {
    const { password } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !password) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Email and password are required");
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid credentials");
    }

    if (!user.isVerified) {
        throw new ApiError(StatusCodes.FORBIDDEN, "Account not verified. Please sign up again.");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid credentials");
    }

    // Generate OTP and send via email
    const otp = await generateOtp(email, "SIGNIN");
    await sendOtpEmail(email, otp, "SIGNIN");

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { email }, "OTP sent to your email. Please verify to complete sign-in.")
    );
});

// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/signin/verify-otp
// ────────────────────────────────────────────────────────────────

export const verifySigninOtp = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !otp) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Email and OTP are required");
    }

    const isValid = await verifyOtp(email, otp, "SIGNIN");

    if (!isValid) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid or expired OTP");
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        throw new ApiError(StatusCodes.NOT_FOUND, "User not found");
    }

    const { accessToken, refreshToken } = await generateTokensAndPersist(user);

    return res
        .status(StatusCodes.OK)
        .cookie("refresh_token", refreshToken, COOKIE_OPTIONS)
        .json(
            new ApiResponse(StatusCodes.OK, { accessToken, email: user.email }, "Signed in successfully")
        );
});

// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/refresh-token
// ────────────────────────────────────────────────────────────────

export const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingToken = req.cookies?.refresh_token || req.body?.refreshToken;

    if (!incomingToken) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Refresh token is required");
    }

    let decoded;
    try {
        decoded = verifyToken(incomingToken, env.refreshTokenSecret);
    } catch {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid or expired refresh token");
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user || user.refreshToken !== incomingToken) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Refresh token is invalid or has been revoked");
    }

    const { accessToken, refreshToken } = await generateTokensAndPersist(user);

    return res
        .status(StatusCodes.OK)
        .cookie("refresh_token", refreshToken, COOKIE_OPTIONS)
        .json(
            new ApiResponse(StatusCodes.OK, { accessToken }, "Access token refreshed")
        );
});

// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout  (protected)
// ────────────────────────────────────────────────────────────────

export const logout = asyncHandler(async (req, res) => {
    await prisma.user.update({
        where: { id: req.user.id },
        data: { refreshToken: null },
    });

    return res
        .status(StatusCodes.OK)
        .clearCookie("refresh_token", COOKIE_OPTIONS)
        .json(
            new ApiResponse(StatusCodes.OK, null, "Logged out successfully")
        );
});


// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/forgot-password
// ────────────────────────────────────────────────────────────────

export const forgotPassword = asyncHandler(async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();

    if (!email) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Email is required");
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return 200 to prevent email enumeration attacks
    if (!user || !user.isVerified) {
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { email }, "If this email is registered, an OTP will be sent.")
        );
    }

    const otp = await generateOtp(email, "FORGOT_PASSWORD");
    await sendOtpEmail(email, otp, "FORGOT_PASSWORD");

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { email }, "OTP sent to your email. Please verify to reset your password.")
    );
});

// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/forgot-password/verify-otp
// ────────────────────────────────────────────────────────────────

export const verifyForgotPasswordOtp = asyncHandler(async (req, res) => {
    const { otp, newPassword } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !otp || !newPassword) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Email, OTP, and new password are required");
    }

    const isValid = await verifyOtp(email, otp, "FORGOT_PASSWORD");

    if (!isValid) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid or expired OTP");
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
        where: { email },
        data: {
            password: hashedPassword,
            refreshToken: null, // invalidate all active sessions
        },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, null, "Password reset successfully. Please sign in again.")
    );
});

// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/update-password  (protected)
// ────────────────────────────────────────────────────────────────

export const updatePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Current password and new password are required");
    }

    if (currentPassword === newPassword) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "New password must differ from the current password");
    }

    // Fetch full user record (req.user from verifyJWT omits password)
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, "Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedPassword,
            refreshToken: null, // invalidate other active sessions
        },
    });

    // Clear the refresh token cookie on the current session too
    return res
        .status(StatusCodes.OK)
        .clearCookie("refresh_token", COOKIE_OPTIONS)
        .json(
            new ApiResponse(StatusCodes.OK, null, "Password updated successfully. Please sign in again.")
        );
});

// ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/resend-otp
// Body: { email, type }  where type is "SIGNUP" | "SIGNIN" | "FORGOT_PASSWORD"
// ────────────────────────────────────────────────────────────────

export const resendOtp = asyncHandler(async (req, res) => {
    const { type } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !type) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Email and type are required");
    }

    if (!["SIGNUP", "SIGNIN", "FORGOT_PASSWORD"].includes(type)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid OTP type");
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        // Return 200 to prevent email enumeration (same pattern as forgotPassword)
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { email }, "If this email is registered, a new OTP will be sent.")
        );
    }

    // For SIGNIN resend, the user must already be verified
    if (type === "SIGNIN" && !user.isVerified) {
        throw new ApiError(StatusCodes.FORBIDDEN, "Account not verified. Please complete signup first.");
    }

    // generateOtp overwrites any existing Redis key with a fresh TTL
    const otp = await generateOtp(email, type);
    await sendOtpEmail(email, otp, type);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { email }, "OTP resent successfully. Please check your email.")
    );
});