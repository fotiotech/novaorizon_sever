import { Router } from "express";
import {
  createBanner,
  deleteBanner,
  fetchBannerOptions,
  getBanner,
  getBannerPreview,
  listBanners,
  updateBanner,
} from "../controllers/banner-content.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const bannerContentRouter = Router();
bannerContentRouter.use(requireAdmin);

bannerContentRouter.get("/", asyncHandler(listBanners));
bannerContentRouter.post("/", asyncHandler(createBanner));
bannerContentRouter.get("/options", asyncHandler(fetchBannerOptions));
bannerContentRouter.get("/:id", asyncHandler(getBanner));
bannerContentRouter.get("/:id/preview", asyncHandler(getBannerPreview));
bannerContentRouter.patch("/:id", asyncHandler(updateBanner));
bannerContentRouter.delete("/:id", asyncHandler(deleteBanner));
