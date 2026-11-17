import { Router } from "express";
import {
  createBrand,
  deleteBrand,
  findProductsByBrand,
  getBrands,
  updateBrand,
} from "../controllers/brand.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const brandRouter = Router();
brandRouter.use(requireAdmin);

brandRouter.get("/", asyncHandler(getBrands));
brandRouter.post("/", asyncHandler(createBrand));
brandRouter.get("/:brandId/products", asyncHandler(findProductsByBrand));
brandRouter.patch("/:id", asyncHandler(updateBrand));
brandRouter.delete("/:id", asyncHandler(deleteBrand));
