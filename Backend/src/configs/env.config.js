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
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "OTP_EXPIRY_MINUTES",
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

  // SMTP
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT, 10),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,

  // OTP
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10),
});

export default env;
