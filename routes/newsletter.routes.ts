import { Router } from "express";
import {
  deleteNewsletterSubscriber,
  exportNewsletterCsv,
  getNewsletterSubscribers,
  subscribeToNewsletter,
  unsubscribeFromNewsletter,
} from "../controllers/newsletter.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const newsletterRouter = Router();

// Public endpoints
newsletterRouter.post("/subscribe", asyncHandler(subscribeToNewsletter));
newsletterRouter.get(
  "/unsubscribe/:token",
  asyncHandler(unsubscribeFromNewsletter),
);

// Admin endpoints
const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.get("/", asyncHandler(getNewsletterSubscribers));
adminRouter.get("/export", asyncHandler(exportNewsletterCsv));
adminRouter.delete("/:id", asyncHandler(deleteNewsletterSubscriber));

newsletterRouter.use(adminRouter);
