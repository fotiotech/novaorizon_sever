import { Router } from "express";
import {
  completePOSOrder,
  createOrUpdateOrder,
  deleteOrder,
  findOrders,
  generateTrackingNumber,
  requestReturn,
  resolveReturnRequest,
  updateOrderStatus,
} from "../controllers/order.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const orderRouter = Router();
orderRouter.use(requireAdmin);

orderRouter.get("/", asyncHandler(findOrders));
orderRouter.post("/pos", asyncHandler(completePOSOrder));
orderRouter.post("/tracking", asyncHandler(generateTrackingNumber));
orderRouter.post("/upsert/:paymentRef", asyncHandler(createOrUpdateOrder));

orderRouter.patch("/:orderNumber/status", asyncHandler(updateOrderStatus));
orderRouter.post("/:orderNumber/return", asyncHandler(requestReturn));
orderRouter.post(
  "/:orderNumber/return/resolve",
  asyncHandler(resolveReturnRequest),
);
orderRouter.delete("/:orderNumber", asyncHandler(deleteOrder));
