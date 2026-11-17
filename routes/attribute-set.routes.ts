import { Router } from "express";
import {
  createAttributeSet,
  deleteAttributeSet,
  getAttributeSet,
  getAttributeSets,
  updateAttributeSet,
} from "../controllers/attribute-set.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const attributeSetRouter = Router();
attributeSetRouter.use(requireAdmin);

attributeSetRouter.get("/", asyncHandler(getAttributeSets));
attributeSetRouter.post("/", asyncHandler(createAttributeSet));
attributeSetRouter.get("/:id", asyncHandler(getAttributeSet));
attributeSetRouter.patch("/:id", asyncHandler(updateAttributeSet));
attributeSetRouter.delete("/:id", asyncHandler(deleteAttributeSet));
