import { Router } from "express";
import {
  getAutocomplete,
  getSearch,
  postSearchProducts,
  postSemanticSearch,
} from "../controllers/search.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const searchRouter = Router();

// Public — storefront search page.
searchRouter.get("/", asyncHandler(getSearch));
// Public — richer storefront engines (ported from the Next app).
searchRouter.post("/products", asyncHandler(postSearchProducts));
searchRouter.post("/semantic", asyncHandler(postSemanticSearch));
searchRouter.get("/autocomplete", asyncHandler(getAutocomplete));
