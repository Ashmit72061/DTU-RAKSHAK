import { Router } from "express";
import {
    signup,
    verifySignupOtp,
    signin,
    verifySigninOtp,
    refreshAccessToken,
    logout,
    forgotPassword,
    verifyForgotPasswordOtp,
    updatePassword
} from "../controllers/auth.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.post("/signup", signup);
router.post("/signup/verify-otp", verifySignupOtp);
router.post("/signin", signin);
router.post("/signin/verify-otp", verifySigninOtp);
router.post("/refresh-token", refreshAccessToken);
router.post("/forgot-password", forgotPassword);                   
router.post("/forgot-password/verify-otp", verifyForgotPasswordOtp);  

// Protected routes
router.post("/logout", verifyJWT, logout);
router.post("/update-password", verifyJWT, updatePassword);   

export default router;
