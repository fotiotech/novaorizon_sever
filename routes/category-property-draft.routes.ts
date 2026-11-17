import { Router } from "express";
import {
  deleteCategoryPropertyDraft,
  getCategoryPropertyDraft,
  saveCategoryPropertyDraft,
} from "../controllers/category-property-draft.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const categoryPropertyDraftRouter = Router();
categoryPropertyDraftRouter.use(requireAdmin);

categoryPropertyDraftRouter.get(
  "/:key",
  asyncHandler(getCategoryPropertyDraft),
);
categoryPropertyDraftRouter.put(
  "/:key",
  asyncHandler(saveCategoryPropertyDraft),
);
categoryPropertyDraftRouter.delete(
  "/:key",
  asyncHandler(deleteCategoryPropertyDraft),
);
