import { Router } from "express";
import {
  exportFinancialData,
  getChartData,
  getFinancialStats,
  getTransactions,
  updateTransactionStatus,
} from "../controllers/finance.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const financeRouter = Router();
financeRouter.use(requireAdmin);

financeRouter.get("/stats", asyncHandler(getFinancialStats));
financeRouter.get("/transactions", asyncHandler(getTransactions));
financeRouter.patch(
  "/transactions/:id/status",
  asyncHandler(updateTransactionStatus),
);
financeRouter.get("/charts", asyncHandler(getChartData));
financeRouter.get("/export", asyncHandler(exportFinancialData));
