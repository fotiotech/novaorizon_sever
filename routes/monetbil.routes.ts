import { Router } from "express";
import {
  generatePaymentLink,
  handlePaymentNotification,
} from "../controllers/monetbil.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const monetbilRouter = Router();

// Public — Monetbil calls this on payment completion. NOT auth-protected.
// Security relies on the HMAC signature (TODO: enforce in controller).
monetbilRouter.all("/notify", asyncHandler(handlePaymentNotification));

// Admin — generate a payment link from the checkout admin.
monetbilRouter.post("/link", requireAdmin, asyncHandler(generatePaymentLink));
