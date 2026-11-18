import { Router } from "express";
import {
  getPublicProduct,
  listPublicBrandProducts,
  listPublicBrands,
  listPublicCarriers,
  listResolvedBlocks,
  listPublicProducts,
  listRelatedProducts,
} from "../controllers/catalog.controller.js";
import {
  getCategoriesForTree,
  getCategoryAttributeSetsHandler,
  getCategoryById,
} from "../controllers/category.controller.js";
import { getResolvedCollections } from "../controllers/collection.controller.js";
import { findHeroContent } from "../controllers/hero-content.controller.js";
import { calculateShippingPrice } from "../controllers/carrier.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Public catalogue API used by the storefront (no authentication).
 */
export const catalogRouter = Router();

catalogRouter.get("/products", asyncHandler(listPublicProducts));
catalogRouter.get("/products/:id", asyncHandler(getPublicProduct));
catalogRouter.get("/products/:id/related", asyncHandler(listRelatedProducts));
catalogRouter.get("/brands", asyncHandler(listPublicBrands));
catalogRouter.get("/brands/:id/products", asyncHandler(listPublicBrandProducts));
catalogRouter.get("/categories/tree", asyncHandler(getCategoriesForTree));
catalogRouter.get("/categories/:id", asyncHandler(getCategoryById));
catalogRouter.get(
  "/categories/:id/attribute-sets",
  asyncHandler(getCategoryAttributeSetsHandler),
);
catalogRouter.get("/collections", asyncHandler(getResolvedCollections));
catalogRouter.get("/hero", asyncHandler(findHeroContent));
catalogRouter.get("/blocks", asyncHandler(listResolvedBlocks));
catalogRouter.get("/carriers", asyncHandler(listPublicCarriers));
catalogRouter.post("/shipping/quote", asyncHandler(calculateShippingPrice));