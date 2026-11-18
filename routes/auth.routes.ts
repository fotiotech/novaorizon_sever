import { Router } from "express";
import { login, logout, me, signup } from "../controllers/auth.controller.js";
import { forgotPassword } from "../controllers/forgot-password.controller.js";
import { resetPassword } from "../controllers/reset-password.controller.js";
import {
  resendVerification,
  verifyEmail,
} from "../controllers/email-verification.controller.js";
import { optionalUser, requireUser } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

/* --------------------------- Public ----------------------------- */
authRouter.post("/login", asyncHandler(login));
authRouter.post("/logout", asyncHandler(logout));
authRouter.post("/forgot-password", asyncHandler(forgotPassword));
authRouter.post("/reset-password", asyncHandler(resetPassword));
authRouter.post("/verify-email", asyncHandler(verifyEmail));
authRouter.post("/resend-verification", asyncHandler(resendVerification));

/* ------------- Unified signup (auth-aware) ---------------------- */
// No role → public customer signup (rate-limited, email verify)
// role=staff → requires admin JWT (rate-limited, pre-verified)
authRouter.post("/signup", optionalUser, asyncHandler(signup));

/* ----------------------- Authenticated -------------------------- */
authRouter.get("/me", requireUser, asyncHandler(me));