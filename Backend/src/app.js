import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import env from "./configs/env.config.js";
import authRoutes from "./routes/auth.routes.js";
import vehicleRoutes from "./routes/vehicle.routes.js";
import cameraRoutes from "./routes/camera.routes.js";
import scanRoutes from "./routes/scan.routes.js";
import errorHandler from "./middlewares/error.middleware.js";
import ApiResponse from "./utils/ApiResponse.js";
import { sseMiddleware } from "./utils/sse.js";

const app = express();

// ────────────────────── Security ──────────────────────
app.use(helmet());
app.use(
    cors({
        origin: env.corsOrigin,
        credentials: true,
    })
);

// ────────────────────── Rate Limiting ──────────────────────
// Strict limiter for frontend dashboard and human interactions
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { statusCode: 429, message: "Too many requests, please try again later.", success: false },
});

// ────────────────────── Body Parsing ──────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// ────────────────────── Logging ──────────────────────
if (env.nodeEnv === "development") {
    app.use(morgan("dev"));
} else {
    app.use(morgan("combined"));
}

// ────────────────────── Routes ──────────────────────
app.use("/api/v1/health",   limiter, (req, res) => res.status(200).json(new ApiResponse(200, { status: "ok" }, "Server is healthy")));

app.use("/api/v1/auth",     limiter, authRoutes);
app.use("/api/v1/vehicles", limiter, vehicleRoutes);
app.use("/api/v1/cameras",  limiter, cameraRoutes);

// Generous sanity-check limit for camera hardware
// Prevents an infinite-loop bug on a camera from flooding Redis memory,
// while remaining generously high enough (1,000/min) to never block rush hour campus traffic.
const cameraLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { statusCode: 429, message: "Camera API Hardware Limit Exceeded.", success: false },
});
app.use("/api/v1/scan",     cameraLimiter, scanRoutes);

// Real-time SSE alert streaming for the Dashboard
app.get("/api/v1/alerts/stream", limiter, sseMiddleware);

// ────────────────────── Global Error Handler ──────────────────────
app.use(errorHandler);

export default app;
