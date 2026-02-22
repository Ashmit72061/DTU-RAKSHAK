import { Router } from "express";
import {
    createCamera,
    getCameras,
    getCamera,
    updateCamera,
    deleteCamera,
} from "../controllers/camera.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

// All camera routes require authentication
router.use(verifyJWT);

router.post("/",     createCamera);
router.get("/",      getCameras);
router.get("/:id",   getCamera);
router.put("/:id",   updateCamera);
router.delete("/:id",deleteCamera);

export default router;
