import { Router } from "express";
import {
    processScan,
    getLogs,
    getActiveLogs,
    getLogsByVehicle,
} from "../controllers/scan.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

// All scan routes require authentication
router.use(verifyJWT);

// Order matters: /logs/active must come before /logs/:vehicleNo
router.post("/",               processScan);           // Body: application/json
router.get("/logs",            getLogs);               // ?page&limit&authorized&from&to&cameraId&logType
router.get("/logs/active",     getActiveLogs);
router.get("/logs/:vehicleNo", getLogsByVehicle);      // ?from&to for date range

export default router;
