import { Router } from "express";
import {
  createPromotion,
  deletePromotion,
  getProductPromotions,
  getPromotion,
  getPromotionOptions,
  getSelectablePromotions,
  previewPromotionRules,
  listPromotions,
  syncProductPromotions,
  updatePromotion,
} from "../controllers/promotion.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const promotionRouter = Router();
promotionRouter.use(requireAdmin);

promotionRouter.get("/", asyncHandler(listPromotions));
promotionRouter.post("/", asyncHandler(createPromotion));
promotionRouter.get("/options", asyncHandler(getPromotionOptions));
promotionRouter.post("/preview", asyncHandler(previewPromotionRules));
promotionRouter.get("/selectable", asyncHandler(getSelectablePromotions));
promotionRouter.get(
  "/by-product/:productId",
  asyncHandler(getProductPromotions),
);
promotionRouter.post(
  "/by-product/:productId/sync",
  asyncHandler(syncProductPromotions),
);
promotionRouter.get("/:id", asyncHandler(getPromotion));
promotionRouter.patch("/:id", asyncHandler(updatePromotion));
promotionRouter.delete("/:id", asyncHandler(deletePromotion));