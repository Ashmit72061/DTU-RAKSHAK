import { Router } from "express";
import multer from "multer";
import {
    scanPlate,
    getLogs,
    getActiveLogs,
    getLogsByVehicle,
} from "../controllers/scan.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Only JPG, PNG, WEBP images are allowed"));
    },
});

// All scan routes require authentication
router.use(verifyJWT);

// Order matters: /logs/active must come before /logs/:vehicleNo
router.post("/",                   upload.single("image"), scanPlate);
router.get("/logs",                getLogs);
router.get("/logs/active",         getActiveLogs);
router.get("/logs/:vehicleNo",     getLogsByVehicle);

export default router;
