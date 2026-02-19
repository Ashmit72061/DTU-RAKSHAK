import crypto from "node:crypto";
import redis from "../models/redis.js";
import env from "../configs/env.config.js";

const OTP_LENGTH = 6;

/**
 * Build a namespaced Redis key for OTP storage.
 * Format: otp:<type>:<email>
 */
const buildKey = (type, email) => `otp:${type}:${email}`;

/**
 * Generate a cryptographically secure numeric OTP,
 * store it in Redis with TTL auto-expiry, and return the code.
 *
 * @param {string} email
 * @param {"SIGNUP"|"SIGNIN"} type
 * @returns {Promise<string>} The generated OTP code
 */
export const generateOtp = async (email, type) => {
    // Generate a secure 6-digit numeric OTP
    const otp = crypto
        .randomInt(Math.pow(10, OTP_LENGTH - 1), Math.pow(10, OTP_LENGTH))
        .toString();

    const key = buildKey(type, email);
    const ttlSeconds = env.otpExpiryMinutes * 60;

    // SET with EX — auto-expires after TTL, replaces any existing OTP for this email+type
    await redis.set(key, otp, "EX", ttlSeconds);

    return otp;
};

/**
 * Verify the OTP for a given email and type.
 * Deletes the key on successful verification (single-use).
 *
 * @param {string} email
 * @param {string} code - The user-supplied OTP
 * @param {"SIGNUP"|"SIGNIN"} type
 * @returns {Promise<boolean>} true if valid, false otherwise
 */
export const verifyOtp = async (email, code, type) => {
    const key = buildKey(type, email);
    const storedOtp = await redis.get(key);

    if (!storedOtp || storedOtp !== code) {
        return false;
    }

    // Delete immediately after successful verification (single-use)
    await redis.del(key);
    return true;
};
