import { Router } from "express";
import {
  getUserById,
  getMe,
  listUsers,
  updateMe,
  updateUserRole,
} from "../controllers/user.controller.js";
import { requireAdmin, requireUser } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const userRouter = Router();

// Static routes must come before parameterised ones
userRouter.get("/", requireAdmin, asyncHandler(listUsers));
userRouter.get("/me", requireUser, asyncHandler(getMe));
userRouter.patch("/me", requireUser, asyncHandler(updateMe));

// Admin-only per-user routes
userRouter.patch("/:id/role", requireAdmin, asyncHandler(updateUserRole));
userRouter.get("/:id", requireAdmin, asyncHandler(getUserById));
