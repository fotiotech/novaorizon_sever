import { Router } from "express";
import {
  getFacebookAdsAnalytics,
  getHistoryAnalytics,
  getHotAnalytics,
  getOrderAnalytics,
  getOverviewData,
  getProductAnalytics,
  getUserAnalytics,
} from "../controllers/analytic.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const analyticRouter = Router();
analyticRouter.use(requireAdmin);

analyticRouter.get("/users", asyncHandler(getUserAnalytics));
analyticRouter.get("/orders", asyncHandler(getOrderAnalytics));
analyticRouter.get("/products", asyncHandler(getProductAnalytics));
analyticRouter.get("/facebook-ads", asyncHandler(getFacebookAdsAnalytics));
analyticRouter.get("/overview", asyncHandler(getOverviewData));
analyticRouter.get("/hot", asyncHandler(getHotAnalytics));
analyticRouter.get("/history", asyncHandler(getHistoryAnalytics));
