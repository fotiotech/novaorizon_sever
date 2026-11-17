import { Router } from "express";
import {
  getPaymentSettings,
  updatePaymentSettings,
} from "../controllers/payment-settings.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const paymentSettingsRouter = Router();
paymentSettingsRouter.use(requireAdmin);

paymentSettingsRouter.get("/", asyncHandler(getPaymentSettings));
paymentSettingsRouter.patch("/", asyncHandler(updatePaymentSettings));
