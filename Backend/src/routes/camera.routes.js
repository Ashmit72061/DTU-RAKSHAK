import { Router } from "express";
import {
    createCamera,
    getCameras,
    getCamera,
    updateCamera,
    deleteCamera,
    bulkImportCameras,
} from "../controllers/camera.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";
import { uploadCsv } from "../middlewares/upload.middleware.js";

const router = Router();

// All camera routes require authentication
router.use(verifyJWT);

router.post("/bulk", uploadCsv, bulkImportCameras);
router.post("/", createCamera);
router.get("/", getCameras);
router.get("/:id", getCamera);
router.put("/:id", updateCamera);
router.delete("/:id", deleteCamera);

export default router;
