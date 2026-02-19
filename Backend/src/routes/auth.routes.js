import { Router } from "express";
import {
    signup,
    verifySignupOtp,
    signin,
    verifySigninOtp,
    refreshAccessToken,
    logout,
} from "../controllers/auth.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.post("/signup", signup);
router.post("/signup/verify-otp", verifySignupOtp);
router.post("/signin", signin);
router.post("/signin/verify-otp", verifySigninOtp);
router.post("/refresh-token", refreshAccessToken);

// Protected routes
router.post("/logout", verifyJWT, logout);

export default router;
