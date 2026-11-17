import { Router } from "express";
import {
  createCategoryPropertyWithMappings,
  deleteCategoryProperty,
  getCategoryProperty,
  updateCategoryPropertyWithMappings,
} from "../controllers/category-property.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const categoryPropertyRouter = Router();
categoryPropertyRouter.use(requireAdmin);

categoryPropertyRouter.get("/", asyncHandler(getCategoryProperty));
categoryPropertyRouter.post(
  "/",
  asyncHandler(createCategoryPropertyWithMappings),
);
categoryPropertyRouter.patch(
  "/:id",
  asyncHandler(updateCategoryPropertyWithMappings),
);
categoryPropertyRouter.delete("/:id", asyncHandler(deleteCategoryProperty));
