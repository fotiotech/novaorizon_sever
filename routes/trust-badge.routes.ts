import { Router } from "express";
import {
  createTrustBadge,
  deleteTrustBadge,
  getTrustBadge,
  listActiveTrustBadges,
  listTrustBadges,
  reorderTrustBadges,
  resyncTrustBadgeInHeroes,
  updateTrustBadge,
} from "../controllers/trust-badge.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const trustBadgeRouter = Router();

// Public — hero component reads active badges.
trustBadgeRouter.get("/active", asyncHandler(listActiveTrustBadges));

const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.get("/", asyncHandler(listTrustBadges));
adminRouter.post("/", asyncHandler(createTrustBadge));
adminRouter.post("/reorder", asyncHandler(reorderTrustBadges));
adminRouter.get("/:id", asyncHandler(getTrustBadge));
adminRouter.patch("/:id", asyncHandler(updateTrustBadge));
adminRouter.delete("/:id", asyncHandler(deleteTrustBadge));
adminRouter.post("/:id/resync", asyncHandler(resyncTrustBadgeInHeroes));

trustBadgeRouter.use(adminRouter);
