import { Router } from "express";
import {
  addToCart,
  applyDiscount,
  clearCart,
  getCart,
  mergeGuestSessionData,
  removeFromCart,
  updateCartItem,
} from "../controllers/cart.controller.js";
import { cartSession } from "../middleware/cart-session.middleware.js";
import { optionalUser, requireUser } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const cartRouter = Router();

// Every cart request gets a stable guest-session cookie. Auth is optional —
// `getIdentifier()` picks userId when present, sessionId otherwise.
cartRouter.use(optionalUser, cartSession);

cartRouter.get("/", asyncHandler(getCart));
cartRouter.post("/items", asyncHandler(addToCart));
cartRouter.patch("/items/:itemId", asyncHandler(updateCartItem));
cartRouter.delete("/items/:itemId", asyncHandler(removeFromCart));
cartRouter.delete("/", asyncHandler(clearCart));
cartRouter.post("/discount", asyncHandler(applyDiscount));

// Merge guest cart into user cart — requires authentication, but still has
// access to the guest session cookie (mounted before).
cartRouter.post("/merge", requireUser, asyncHandler(mergeGuestSessionData));