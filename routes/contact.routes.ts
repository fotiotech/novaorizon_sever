import { Router } from "express";
import {
  deleteContactMessage,
  getContactMessageById,
  getContactMessages,
  getNewContactCount,
  submitContactMessage,
  updateContactStatus,
} from "../controllers/contact.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const contactRouter = Router();

// PUBLIC — no auth, but rate-limited inside the controller.
contactRouter.post("/", asyncHandler(submitContactMessage));

// Admin sub-tree — nothing below this point is public.
const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/", asyncHandler(getContactMessages));
adminRouter.get("/new-count", asyncHandler(getNewContactCount));
adminRouter.get("/:id", asyncHandler(getContactMessageById));
adminRouter.patch("/:id/status", asyncHandler(updateContactStatus));
adminRouter.delete("/:id", asyncHandler(deleteContactMessage));

contactRouter.use(adminRouter);
