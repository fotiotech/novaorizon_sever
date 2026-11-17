import { Router } from "express";
import {
  bulkUpdateMetaTags,
  createMetaTag,
  deleteMetaTag,
  getMetaTagById,
  getMetaTagByUrl,
  getMetaTags,
  getMetaTagsForSitemap,
  toggleMetaTagStatus,
  updateMetaTag,
} from "../controllers/meta-tag.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const metaTagRouter = Router();

// Public — storefront fetches meta tags for the current URL.
metaTagRouter.get("/by-url", asyncHandler(getMetaTagByUrl));

// Admin only.
const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.get("/", asyncHandler(getMetaTags));
adminRouter.post("/", asyncHandler(createMetaTag));
adminRouter.get("/sitemap", asyncHandler(getMetaTagsForSitemap));
adminRouter.patch("/bulk", asyncHandler(bulkUpdateMetaTags));
adminRouter.get("/:id", asyncHandler(getMetaTagById));
adminRouter.patch("/:id", asyncHandler(updateMetaTag));
adminRouter.delete("/:id", asyncHandler(deleteMetaTag));
adminRouter.post("/:id/toggle", asyncHandler(toggleMetaTagStatus));

metaTagRouter.use(adminRouter);
