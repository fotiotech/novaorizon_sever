import { Router } from "express";
import {
  createBlock,
  deleteBlock,
  getAllBlocks,
  getBlockById,
  getSourcePreview,
  reorderBlocks,
  updateBlock,
} from "../controllers/block.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const blockRouter = Router();
blockRouter.use(requireAdmin);

blockRouter.get("/", asyncHandler(getAllBlocks));
blockRouter.post("/", asyncHandler(createBlock));
blockRouter.post("/reorder", asyncHandler(reorderBlocks));
blockRouter.get(
  "/source-preview/:sourceType/:id",
  asyncHandler(getSourcePreview),
);
blockRouter.get("/:id", asyncHandler(getBlockById));
blockRouter.patch("/:id", asyncHandler(updateBlock));
blockRouter.delete("/:id", asyncHandler(deleteBlock));
