import { Router } from "express";
import {
  assignCategoryProperty,
  createCategory,
  deleteCategory,
  deleteCategoryImage,
  getAllAttributeGroups,
  getAllAttributes,
  getAllAttributeSets,
  getCategoriesForTree,
  getCategoryAttributeSetsHandler as getCategoryAttributeSets,
  getCategoryById,
  listCategories,
  listChildren,
  listChildrenByName,
  runCategoryInheritance,
  updateCategory,
} from "../controllers/category.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const categoryRouter = Router();

// Every category endpoint mirrors the original `requireAdmin()` guard.
categoryRouter.use(requireAdmin);

// ── Meta endpoints — declared first so `/meta/...` doesn't collide with `/:id`
categoryRouter.get("/meta/attribute-sets", asyncHandler(getAllAttributeSets));
categoryRouter.get(
  "/meta/attribute-groups",
  asyncHandler(getAllAttributeGroups),
);
categoryRouter.get("/meta/attributes", asyncHandler(getAllAttributes));

// ── Tree view
categoryRouter.get("/tree", asyncHandler(getCategoriesForTree));

// ── Lookup by parent name (matches original getCategory({ name }))
categoryRouter.get("/name/:name/children", asyncHandler(listChildrenByName));

// ── List + per-parent children
categoryRouter.get("/", asyncHandler(listCategories));
categoryRouter.get("/:id", asyncHandler(getCategoryById));
categoryRouter.get("/:id/children", asyncHandler(listChildren));

// ── Inheritance / properties
categoryRouter.get(
  "/:id/attribute-sets",
  asyncHandler(getCategoryAttributeSets),
);
categoryRouter.patch("/:id/property", asyncHandler(assignCategoryProperty));
categoryRouter.post("/:id/inheritance", asyncHandler(runCategoryInheritance));

// ── Create / update / delete
categoryRouter.post("/", asyncHandler(createCategory));
categoryRouter.patch("/:id", asyncHandler(updateCategory));
categoryRouter.delete("/:id", asyncHandler(deleteCategory));

// ── Image deletion (POST instead of DELETE-with-body for proxy safety)
categoryRouter.post("/:id/images/delete", asyncHandler(deleteCategoryImage));
