import { Router } from "express";
import {
  getPublicProduct,
  listPublicProducts,
  listRelatedProducts,
} from "../controllers/catalog.controller.js";
import { getCategoriesForTree } from "../controllers/category.controller.js";
import { getResolvedCollections } from "../controllers/collection.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Public catalogue API used by the storefront (no authentication).
 */
export const catalogRouter = Router();

catalogRouter.get("/products", asyncHandler(listPublicProducts));
catalogRouter.get("/products/:id", asyncHandler(getPublicProduct));
catalogRouter.get("/products/:id/related", asyncHandler(listRelatedProducts));
catalogRouter.get("/categories/tree", asyncHandler(getCategoriesForTree));
catalogRouter.get("/collections", asyncHandler(getResolvedCollections));
