import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import env from "./configs/env.config.js";
import authRoutes from "./routes/auth.routes.js";
import errorHandler from "./middlewares/error.middleware.js";
import ApiResponse from "./utils/ApiResponse.js";

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
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { statusCode: 429, message: "Too many requests, please try again later.", success: false },
});
app.use(limiter);

// ────────────────────── Body Parsing ──────────────────────
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// ────────────────────── Logging ──────────────────────
if (env.nodeEnv === "development") {
    app.use(morgan("dev"));
} else {
    app.use(morgan("combined"));
}

// ────────────────────── Health Check ──────────────────────
app.get("/api/v1/health", (_req, res) => {
    res.status(200).json(new ApiResponse(200, { status: "ok" }, "Server is healthy"));
});

// ────────────────────── Routes ──────────────────────
app.use("/api/v1/auth", authRoutes);

// ────────────────────── Global Error Handler ──────────────────────
app.use(errorHandler);

export default app;
