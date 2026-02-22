import { Router } from "express";
import {
    createVehicle,
    getVehicles,
    getVehicle,
    updateVehicle,
    deleteVehicle,
} from "../controllers/vehicle.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

// All vehicle routes require authentication
router.use(verifyJWT);

router.post("/",              createVehicle);
router.get("/",               getVehicles);
router.get("/:vehicleNo",     getVehicle);
router.put("/:vehicleNo",     updateVehicle);
router.delete("/:vehicleNo",  deleteVehicle);

export default router;
