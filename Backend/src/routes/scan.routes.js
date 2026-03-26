import { Router } from "express";
import {
    processScan,
    getLogs,
    getActiveLogs,
    getLogsByVehicle,
    getEntryPath,
} from "../controllers/scan.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";
import verifyEdgeApiKey from "../middlewares/edgeAuth.middleware.js";

const router = Router();

// ── Edge device route ──────────────────────────────────────────────────────────
// Authenticated by shared API key (X-Edge-Api-Key header), NOT a user JWT.
// Edge devices (cameras running YOLO + Flask) call this when a plate is detected.
// router.post("/", verifyEdgeApiKey, processScan); // for production   
router.post("/", processScan); // for development

// ── Dashboard routes (admin UI) ────────────────────────────────────────────────
// Requires a valid user JWT (logged-in admin).
router.get("/logs", verifyJWT, getLogs);               // ?page&limit&authorized&from&to&cameraId&logType
router.get("/logs/active", verifyJWT, getActiveLogs);
router.get("/logs/:vehicleNo", verifyJWT, getLogsByVehicle);      // ?from&to for date range
router.get("/entry-path/:entryId", verifyJWT, getEntryPath);

export default router;
