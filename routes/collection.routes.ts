import { Router } from "express";
import {
  createCollection,
  deleteCollection,
  deleteCollectionImage,
  fetchAvailableItems,
  fetchReferenceOptions,
  getAllCollections,
  getCollectionById,
  getResolvedCollections,
  updateCollection,
} from "../controllers/collection.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const collectionRouter = Router();
collectionRouter.use(requireAdmin);

collectionRouter.get("/", asyncHandler(getAllCollections));
collectionRouter.post("/", asyncHandler(createCollection));
collectionRouter.get("/resolved", asyncHandler(getResolvedCollections));
collectionRouter.get("/available-items", asyncHandler(fetchAvailableItems));
collectionRouter.get(
  "/ref-options/:refType",
  asyncHandler(fetchReferenceOptions),
);
collectionRouter.get("/:id", asyncHandler(getCollectionById));
collectionRouter.patch("/:id", asyncHandler(updateCollection));
collectionRouter.delete("/:id", asyncHandler(deleteCollection));
collectionRouter.delete("/:id/image", asyncHandler(deleteCollectionImage));
