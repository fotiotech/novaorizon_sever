import { Router } from "express";
import {
  deleteProductDraft,
  getProductDraft,
  saveProductDraft,
} from "../controllers/draft.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const draftRouter = Router();
draftRouter.use(requireAdmin);

draftRouter.get("/:productId", asyncHandler(getProductDraft));
draftRouter.put("/:productId", asyncHandler(saveProductDraft));
draftRouter.delete("/:productId", asyncHandler(deleteProductDraft));
