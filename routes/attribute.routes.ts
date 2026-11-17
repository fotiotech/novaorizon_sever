import { Router } from "express";
import {
  createAttribute,
  deleteAttribute,
  findAttributesAndValues,
  getAttributesUsageMap,
  updateAttribute,
} from "../controllers/attribute.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const attributeRouter = Router();
attributeRouter.use(requireAdmin);

attributeRouter.get("/usage", asyncHandler(getAttributesUsageMap));
attributeRouter.get("/", asyncHandler(findAttributesAndValues));
attributeRouter.post("/", asyncHandler(createAttribute));
attributeRouter.patch("/:id", asyncHandler(updateAttribute));
attributeRouter.delete("/:id", asyncHandler(deleteAttribute));
