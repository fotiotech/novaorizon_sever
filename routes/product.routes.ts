import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  deleteProductImages,
  findProductById,
  findProducts,
  getCategoryProductCounts,
  getProductFilterCategories,
  listProducts,
  recreateProduct,
  updateProduct,
  updateProductCategory,
  updateProductQuantity,
  updateProductStatus,
  updateProductStockLevel,
} from "../controllers/product.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const productRouter = Router();
productRouter.use(requireAdmin);

// Meta / filters
productRouter.get(
  "/filter-categories",
  asyncHandler(getProductFilterCategories),
);
productRouter.get("/category-counts", asyncHandler(getCategoryProductCounts));
productRouter.get("/picker", asyncHandler(listProducts));

// Standard CRUD
productRouter.get("/", asyncHandler(findProducts));
productRouter.post("/", asyncHandler(createProduct));
productRouter.get("/:id", asyncHandler(findProductById));
productRouter.patch("/:id", asyncHandler(updateProduct));
productRouter.delete("/:id", asyncHandler(deleteProduct));

// Sub-resources
productRouter.post("/:id/recreate", asyncHandler(recreateProduct));
productRouter.patch("/:id/category", asyncHandler(updateProductCategory));
productRouter.patch("/:id/status", asyncHandler(updateProductStatus));
productRouter.patch("/:id/quantity", asyncHandler(updateProductQuantity));
productRouter.patch("/:id/stock", asyncHandler(updateProductStockLevel));
productRouter.delete("/images", asyncHandler(deleteProductImages));
