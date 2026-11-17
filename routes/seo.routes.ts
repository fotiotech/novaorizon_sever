import { Router } from "express";
import {
  getSeoSetting,
  saveSeoSetting,
} from "../controllers/seo.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const seoRouter = Router();

// Public — storefront reads this for <head> tags.
seoRouter.get("/", asyncHandler(getSeoSetting));

// Admin write.
seoRouter.patch("/", requireAdmin, asyncHandler(saveSeoSetting));
