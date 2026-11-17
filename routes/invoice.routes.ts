import { Router } from "express";
import {
  createInvoice,
  downloadInvoice,
  findInvoices,
  getInvoiceByOrderNumber,
  getInvoicesByUserId,
  updateInvoiceStatus,
} from "../controllers/invoice.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const invoiceRouter = Router();
invoiceRouter.use(requireAdmin);

invoiceRouter.get("/", asyncHandler(findInvoices));
invoiceRouter.get("/order/:orderNumber", asyncHandler(getInvoiceByOrderNumber));
invoiceRouter.get("/user/:userId", asyncHandler(getInvoicesByUserId));
invoiceRouter.post("/order/:orderNumber", asyncHandler(createInvoice));
invoiceRouter.patch(
  "/:invoiceNumber/status",
  asyncHandler(updateInvoiceStatus),
);
invoiceRouter.get("/:invoiceNumber/download", asyncHandler(downloadInvoice));
