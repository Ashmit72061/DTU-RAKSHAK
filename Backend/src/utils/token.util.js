import jwt from "jsonwebtoken";
import env from "../configs/env.config.js";

/**
 * Generate a short-lived access token.
 * @param {Object} payload - Data to encode (e.g. { id, email })
 * @returns {string} Signed JWT
 */
export const generateAccessToken = (payload) =>
    jwt.sign(payload, env.accessTokenSecret, { expiresIn: env.accessTokenExpiry });

/**
 * Generate a long-lived refresh token.
 * @param {Object} payload - Data to encode (e.g. { id })
 * @returns {string} Signed JWT
 */
export const generateRefreshToken = (payload) =>
    jwt.sign(payload, env.refreshTokenSecret, { expiresIn: env.refreshTokenExpiry });

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @param {string} secret
 * @returns {Object} Decoded payload
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
export const verifyToken = (token, secret) => jwt.verify(token, secret);
