import { Router } from "express";
import {
  getInventory,
  getInventoryStats,
  updateInventory,
} from "../controllers/inventory.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const inventoryRouter = Router();
inventoryRouter.use(requireAdmin);

inventoryRouter.get("/", asyncHandler(getInventory));
inventoryRouter.get("/stats", asyncHandler(getInventoryStats));
inventoryRouter.patch("/:productId", asyncHandler(updateInventory));
