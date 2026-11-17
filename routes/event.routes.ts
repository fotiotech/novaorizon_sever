import { Router } from "express";
import {
  getEventsSince,
  getLikeStates,
  getRecentlyViewed,
  getRecommendations,
  getRelatedProducts,
  getTrendingItems,
  getTrendingItemsFast,
  mergeGuestEvents,
  toggleLike,
  trackEvent,
} from "../controllers/event.controller.js";
import { requireUser, requireAdmin } from "../middleware/auth.middleware.js";
import { cartSession } from "../middleware/cart-session.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const eventRouter = Router();

/* -------------------------- public (tracked) -------------------------- */
// Track uses cartSession so anonymous guests get a stable identifier.
// isBot() filters at the service layer.
eventRouter.post("/track", cartSession, asyncHandler(trackEvent));

/* ------------------------ public (reads) ------------------------------ */
eventRouter.get("/trending", asyncHandler(getTrendingItems));
eventRouter.get("/trending-fast", asyncHandler(getTrendingItemsFast));
eventRouter.get("/related/:productId", asyncHandler(getRelatedProducts));
eventRouter.get("/likes", asyncHandler(getLikeStates));

/* ------------------------ authenticated --------------------------------- */
eventRouter.get(
  "/recommendations",
  requireUser,
  asyncHandler(getRecommendations),
);
eventRouter.get(
  "/recently-viewed",
  requireUser,
  asyncHandler(getRecentlyViewed),
);
eventRouter.post("/toggle-like", requireUser, asyncHandler(toggleLike));
eventRouter.post(
  "/merge-guest",
  requireUser,
  cartSession,
  asyncHandler(mergeGuestEvents),
);

/* -------------------- admin (live-feed polling) ------------------------ */
eventRouter.get("/since", requireAdmin, asyncHandler(getEventsSince));
