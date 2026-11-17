import { Router } from "express";
import {
  getGeneralSettings,
  updateGeneralSettings,
} from "../controllers/setting.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const settingRouter = Router();

// Public — storefront reads storeName, logoUrl, contact info, etc.
settingRouter.get("/general", asyncHandler(getGeneralSettings));

// Admin write.
settingRouter.patch(
  "/general",
  requireAdmin,
  asyncHandler(updateGeneralSettings),
);
