import { Router } from "express";
import {
  dailySnapshot,
  productMetricsJob,
  rollupEventsJob,
} from "../controllers/cron.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** Cron jobs (Bearer CRON_SECRET). Mounted at /api/cron. */
export const cronRouter = Router();

cronRouter.post("/daily-snapshot", asyncHandler(dailySnapshot));
cronRouter.post("/rollup", asyncHandler(rollupEventsJob));
cronRouter.post("/product-metrics", asyncHandler(productMetricsJob));