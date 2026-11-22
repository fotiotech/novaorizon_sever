import { Router } from "express";
import {
  createTile,
  deleteTile,
  getTile,
  listAllTiles,
  listTiles,
  reorderTiles,
  updateTile,
} from "../controllers/tile.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const tileRouter = Router();

/** Public storefront feed. */
tileRouter.get("/", asyncHandler(listTiles));

/** Admin CRUD. */
tileRouter.get("/admin", requireAdmin, asyncHandler(listAllTiles));
tileRouter.get("/admin/:id", requireAdmin, asyncHandler(getTile));
tileRouter.post("/", requireAdmin, asyncHandler(createTile));
tileRouter.patch("/:id", requireAdmin, asyncHandler(updateTile));
tileRouter.delete("/:id", requireAdmin, asyncHandler(deleteTile));
tileRouter.post("/reorder", requireAdmin, asyncHandler(reorderTiles));
