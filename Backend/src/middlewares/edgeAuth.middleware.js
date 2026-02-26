/**
 * edgeAuth.middleware.js
 * ─────────────────────
 * Authenticates requests coming from edge devices (cameras running Flask/YOLO).
 *
 * Edge devices use a long-lived shared secret sent in the `X-Edge-Api-Key`
 * header — they do NOT go through the user JWT flow.
 *
 * The key is stored in EDGE_API_KEY env var and compared using a timing-safe
 * check to prevent timing-based brute-force attacks.
 */

import { timingSafeEqual } from "crypto";
import { StatusCodes } from "http-status-codes";
import ApiResponse from "../utils/ApiResponse.js";

const verifyEdgeApiKey = (req, res, next) => {
    const incomingKey = req.headers["x-edge-api-key"];
    const expectedKey = process.env.EDGE_API_KEY;

    // Reject immediately if either key is missing
    if (!incomingKey || !expectedKey) {
        return res
            .status(StatusCodes.UNAUTHORIZED)
            .json(new ApiResponse(StatusCodes.UNAUTHORIZED, null, "Missing edge API key"));
    }

    // Timing-safe comparison prevents brute-force timing attacks
    try {
        const incoming = Buffer.from(incomingKey);
        const expected = Buffer.from(expectedKey);

        // Buffers must be the same length for timingSafeEqual
        if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json(new ApiResponse(StatusCodes.UNAUTHORIZED, null, "Invalid edge API key"));
        }
    } catch {
        return res
            .status(StatusCodes.UNAUTHORIZED)
            .json(new ApiResponse(StatusCodes.UNAUTHORIZED, null, "Invalid edge API key"));
    }

    next();
};

export default verifyEdgeApiKey;
