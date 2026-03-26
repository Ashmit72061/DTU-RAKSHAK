import crypto from "node:crypto";
import env from "../configs/env.config.js";
import { normalisePlate } from "./plate.js";

// Re-export so callers only need one import for all crypto + normalization needs
export { normalisePlate as normalizeVehicleNo };

const ALGORITHM = "aes-256-gcm";
const IV_BYTES   = 12; // 96-bit IV — recommended for GCM
const TAG_BYTES  = 16; // 128-bit auth tag

/** Lazily decoded key buffer — decoded once and cached. */
let _keyBuffer = null;
function getKey() {
    if (!_keyBuffer) {
        _keyBuffer = Buffer.from(env.encryptionKey, "base64");
        if (_keyBuffer.length !== 32) {
            throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
        }
    }
    return _keyBuffer;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Generates a fresh random 12-byte IV per call.
 *
 * @param {string} plaintext
 * @returns {{ iv: string, content: string, tag: string }} — all hex-encoded
 */
export function encrypt(plaintext) {
    const iv     = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_BYTES });

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag       = cipher.getAuthTag();

    return {
        iv:      iv.toString("hex"),
        content: encrypted.toString("hex"),
        tag:     tag.toString("hex"),
    };
}

/**
 * Decrypts an AES-256-GCM ciphertext object.
 *
 * @param {{ iv: string, content: string, tag: string }} encryptedObj
 * @returns {string} plaintext
 * @throws if the auth tag does not verify (tampered data)
 */
export function decrypt({ iv, content, tag }) {
    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        getKey(),
        Buffer.from(iv, "hex"),
        { authTagLength: TAG_BYTES }
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(content, "hex")),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
}

/**
 * Deterministic SHA-256 hash of a normalized value.
 * Used ONLY for exact-match DB lookups — NOT for security.
 * No salt needed since these values are normalized before hashing.
 *
 * @param {string} normalizedValue
 * @returns {string} 64-char lowercase hex
 */
export function hashField(normalizedValue) {
    return crypto.createHash("sha256").update(normalizedValue).digest("hex");
}

/**
 * Normalizes a phone number to a standard format before hashing/encrypting.
 * - Removes all non-digit characters
 * - Prefixes +91 for 10-digit Indian numbers
 * - Returns as-is (digits only) for other lengths
 *
 * @param {string} raw
 * @returns {string} normalized phone string
 */
export function normalizePhone(raw) {
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return digits; // e.g. international numbers stored as pure digits
}

/**
 * Checks whether a value looks like an already-encrypted blob.
 * Prevents double-encryption if a field is processed twice.
 *
 * @param {string|object} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
    if (typeof value !== "object" || value === null) return false;
    return typeof value.iv === "string"
        && typeof value.content === "string"
        && typeof value.tag === "string";
}

/**
 * Safely decrypts a vehicle's sensitive fields.
 * Returns the vehicle object with plaintext mobileNo and vehicleNo,
 * stripping the raw encrypted blobs and hash fields from the response.
 *
 * @param {object} vehicle — Prisma vehicle record
 * @returns {object} — safe-to-send response object
 */
export function decryptVehicle(vehicle) {
    if (!vehicle) return vehicle;

    let mobileNo   = null;
    let vehicleNo  = null;

    try {
        mobileNo = vehicle.mobileNo ? decrypt(JSON.parse(vehicle.mobileNo)) : null;
    } catch {
        // If decryption fails (e.g. pre-encryption legacy data), surface raw value
        mobileNo = vehicle.mobileNo;
    }

    try {
        vehicleNo = vehicle.vehicleNo ? decrypt(JSON.parse(vehicle.vehicleNo)) : null;
    } catch {
        vehicleNo = vehicle.vehicleNo;
    }

    // Strip hash columns — frontend never needs them
    const { vehicleNoHash, mobileNoHash, ...rest } = vehicle;

    return { ...rest, vehicleNo, mobileNo };
}
