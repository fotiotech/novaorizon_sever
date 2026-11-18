import { Router } from "express";
import {
  createOrder,
  downloadMyInvoice,
  getMyInvoice,
  getOrder,
  listMyOrders,
  previewPromotions,
  requestOrderReturn,
  recordPromoUsage,
  startOrderPayment,
  validatePromoCode,
} from "../controllers/checkout.controller.js";
import { optionalUser } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const checkoutRouter = Router();
checkoutRouter.use(optionalUser);

checkoutRouter.get("/orders", asyncHandler(listMyOrders));
checkoutRouter.post("/orders", asyncHandler(createOrder));
checkoutRouter.get("/orders/:orderNumber", asyncHandler(getOrder));
checkoutRouter.post("/orders/:orderNumber/pay", asyncHandler(startOrderPayment));
checkoutRouter.post("/orders/:orderNumber/return", asyncHandler(requestOrderReturn));
checkoutRouter.get("/orders/:orderNumber/invoice", asyncHandler(getMyInvoice));
checkoutRouter.get("/invoices/:invoiceNumber/download", asyncHandler(downloadMyInvoice));
checkoutRouter.post("/promotions/preview", asyncHandler(previewPromotions));
checkoutRouter.post("/promotions/validate", asyncHandler(validatePromoCode));
checkoutRouter.post("/promotions/usage", asyncHandler(recordPromoUsage));