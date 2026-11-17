import { Router } from "express";
import {
  deleteNotification,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendNotification,
} from "../controllers/notification.controller.js";
import { requireAdmin, requireUser } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const notificationRouter = Router();

// Admin — push a notification to every active admin.
notificationRouter.post("/send", requireAdmin, asyncHandler(sendNotification));

// User — own notification inbox.
notificationRouter.get("/", requireUser, asyncHandler(listMyNotifications));
notificationRouter.patch(
  "/read-all",
  requireUser,
  asyncHandler(markAllNotificationsRead),
);
notificationRouter.patch(
  "/:id/read",
  requireUser,
  asyncHandler(markNotificationRead),
);
notificationRouter.delete(
  "/:id",
  requireUser,
  asyncHandler(deleteNotification),
);
