import { Router } from "express";
import { registerToken } from "../controllers/device.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/token", verifyJWT, registerToken);

export default router;