import "dotenv/config";
import crypto from "node:crypto";

/**
 * Centralised environment configuration.
 * Every env var the app needs is validated here at startup.
 * Nothing is hardcoded — missing vars throw immediately.
 *
 * Email provider is selected via EMAIL_PROVIDER:
 *   "smtp"   → nodemailer (default, active)
 *   "resend" → Resend SDK (legacy, kept for easy rollback)
 */

// ── Always-required vars ─────────────────────────────────────────────────────
const requiredVars = [
  "DATABASE_URL",
  "REDIS_URL",
  "PORT",
  "NODE_ENV",
  "CORS_ORIGIN",
  "ACCESS_TOKEN_SECRET",
  "ACCESS_TOKEN_EXPIRY",
  "REFRESH_TOKEN_SECRET",
  "REFRESH_TOKEN_EXPIRY",
  "EMAIL_PROVIDER",
  "EMAIL_FROM",
  "OTP_EXPIRY_MINUTES",
  "EDGE_API_KEY",
  "ENCRYPTION_KEY",
];

const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `❌ Missing required environment variables:\n  ${missing.join("\n  ")}`
  );
}

// ── Provider-specific validation ─────────────────────────────────────────────
const emailProvider = process.env.EMAIL_PROVIDER;

const smtpRequired = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE"];
const resendRequired = ["RESEND_API_KEY"];

const providerRequired = emailProvider === "resend" ? resendRequired : smtpRequired;
const missingProviderVars = providerRequired.filter((key) => !process.env[key]);

if (missingProviderVars.length > 0) {
  throw new Error(
    `❌ Missing credentials for EMAIL_PROVIDER="${emailProvider}":\n  ${missingProviderVars.join("\n  ")}`
  );
}

// ── Frozen config object ─────────────────────────────────────────────────────
const env = Object.freeze({
  // Server
  port: parseInt(process.env.PORT, 10),
  nodeEnv: process.env.NODE_ENV,
  corsOrigin: process.env.CORS_ORIGIN,

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // Redis
  redisUrl: process.env.REDIS_URL,

  // JWT
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
  refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY,

  // Email — provider selection
  emailProvider,

  // Email — SMTP (active when EMAIL_PROVIDER=smtp)
  smtp: Object.freeze({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === "true",   // true → port 465, false → STARTTLS
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }),

  // Email — Resend (active when EMAIL_PROVIDER=resend)
  resendApiKey: process.env.RESEND_API_KEY ?? null,

  // Email — shared
  emailFrom: process.env.EMAIL_FROM,

  // OTP
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10),

  // Edge devices
  edgeApiKey: process.env.EDGE_API_KEY,

  // AES-256-GCM field encryption (base64-encoded 32-byte key)
  encryptionKey: process.env.ENCRYPTION_KEY,
});

// Validate encryption key length at startup — crash early rather than silently misencrypt
const _keyCheck = Buffer.from(process.env.ENCRYPTION_KEY, "base64");
if (_keyCheck.length !== 32) {
  throw new Error(`❌ ENCRYPTION_KEY must decode to exactly 32 bytes (got ${_keyCheck.length})`);
}

export default env;
