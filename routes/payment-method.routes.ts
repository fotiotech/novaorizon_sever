import { Router } from "express";
import {
  createPaymentMethod,
  deletePaymentMethod,
  getUserPaymentMethods,
  updateCreditCard,
} from "../controllers/payment-method.controller.js";
import { requireUser } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const paymentMethodRouter = Router();
paymentMethodRouter.use(requireUser);

paymentMethodRouter.get("/", asyncHandler(getUserPaymentMethods));
paymentMethodRouter.post("/", asyncHandler(createPaymentMethod));
paymentMethodRouter.patch("/:id/card", asyncHandler(updateCreditCard));
paymentMethodRouter.delete("/:id", asyncHandler(deletePaymentMethod));
