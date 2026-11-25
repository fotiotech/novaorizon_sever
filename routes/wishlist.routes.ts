import { Router } from "express";
import {
  addToWishlist,
  getWishlist,
  isWishlisted,
  removeFromWishlist,
} from "../controllers/wishlist.controller.js";
import { requireUser } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const wishlistRouter = Router();
wishlistRouter.use(requireUser);

wishlistRouter.get("/", asyncHandler(getWishlist));
wishlistRouter.get("/:productId", asyncHandler(isWishlisted));
wishlistRouter.post("/:productId", asyncHandler(addToWishlist));
wishlistRouter.delete("/:productId", asyncHandler(removeFromWishlist));
