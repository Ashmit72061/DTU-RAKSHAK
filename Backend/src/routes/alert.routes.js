import { Router } from "express";
import verifyJwt from "../middlewares/auth.middleware.js";
import { getAlerts, acknowledgeAlert, resolveAlert } from "../controllers/alert.controller.js";

const router = Router();

// All alert routes require admin JWT
router.use(verifyJwt);

router.get("/",                     getAlerts);
router.patch("/:id/acknowledge",    acknowledgeAlert);
router.patch("/:id/resolve",        resolveAlert);

export default router;
