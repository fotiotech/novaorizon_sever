import { Router } from "express";
import {
  createAttributeGroup,
  deleteAttributeGroup,
  findAllAttributeGroups,
  findGroup,
  getAttributeGroupsUsageMap,
  updateAttributeGroup,
} from "../controllers/attribute-group.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const attributeGroupRouter = Router();
attributeGroupRouter.use(requireAdmin);

attributeGroupRouter.get("/usage", asyncHandler(getAttributeGroupsUsageMap));
attributeGroupRouter.get("/tree", asyncHandler(findGroup));
attributeGroupRouter.get("/", asyncHandler(findAllAttributeGroups));
attributeGroupRouter.post("/", asyncHandler(createAttributeGroup));
attributeGroupRouter.patch("/:id", asyncHandler(updateAttributeGroup));
attributeGroupRouter.delete("/:id", asyncHandler(deleteAttributeGroup));
