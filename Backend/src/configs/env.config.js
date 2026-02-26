import "dotenv/config";

/**
 * Centralised environment configuration.
 * Every env var the app needs is validated here at startup.
 * Nothing is hardcoded — missing vars throw immediately.
 */

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
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "OTP_EXPIRY_MINUTES",
  "EDGE_API_KEY",
];

const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `❌ Missing required environment variables:\n  ${missing.join("\n  ")}`
  );
}

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

  // Resend
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM,

  // OTP
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10),

  // Edge devices
  edgeApiKey: process.env.EDGE_API_KEY,
});

export default env;
