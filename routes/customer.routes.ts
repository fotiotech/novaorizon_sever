import { Router } from "express";
import {
  deleteCustomer,
  getCustomer,
  listCustomers,
} from "../controllers/customer.controller.js";
import {
  deleteMyReview,
  deleteReview,
  listMyReviews,
  listReviews,
  upsertProductReview,
} from "../controllers/review.controller.js";
import { requireUser } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** Admin customer directory (/api/customers). */
export const customerRouter = Router();
customerRouter.use(requireAdmin);
customerRouter.get("/", asyncHandler(listCustomers));
customerRouter.get("/:id", asyncHandler(getCustomer));
customerRouter.delete("/:id", asyncHandler(deleteCustomer));

/** Reviews (/api/reviews). */
export const reviewRouter = Router();

// Customer routes (must come before requireAdmin).
reviewRouter.post("/products/:id", requireUser, asyncHandler(upsertProductReview));
reviewRouter.get("/mine", requireUser, asyncHandler(listMyReviews));
reviewRouter.delete("/mine/:productId", requireUser, asyncHandler(deleteMyReview));

reviewRouter.use(requireAdmin);
reviewRouter.get("/", asyncHandler(listReviews));
reviewRouter.delete("/:id", asyncHandler(deleteReview));