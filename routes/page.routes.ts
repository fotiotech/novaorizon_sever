import { Router } from "express";
import {
  createPage,
  deletePage,
  getPageById,
  getPageBySlug,
  getPages,
  updatePage,
} from "../controllers/page.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const pageRouter = Router();

// Public — storefront fetches published pages by slug.
pageRouter.get("/by-slug/:slug", asyncHandler(getPageBySlug));

// Admin only — everything below this line.
const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.get("/", asyncHandler(getPages));
adminRouter.post("/", asyncHandler(createPage));
adminRouter.get("/:id", asyncHandler(getPageById));
adminRouter.patch("/:id", asyncHandler(updatePage));
adminRouter.delete("/:id", asyncHandler(deletePage));

pageRouter.use(adminRouter);
