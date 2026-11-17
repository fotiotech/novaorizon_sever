import { Router } from "express";
import { getSearch } from "../controllers/search.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const searchRouter = Router();

// Public — storefront search page.
searchRouter.get("/", asyncHandler(getSearch));
