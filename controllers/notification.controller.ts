import type { Request, Response } from "express";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import {
  notifyAdmins,
  type NotificationKind,
} from "../utils/notification.service.js";

const VALID_KINDS: NotificationKind[] = [
  "order",
  "payment",
  "promotion",
  "product",
  "system",
];

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function authenticatedUserId(req: Request): string {
  return (req as Request & { user: { id: string } }).user.id;
}

/* ---------------------------- admin: send ------------------------------- */

export async function sendNotification(
  req: Request,
  res: Response,
): Promise<void> {
  const { kind, message } = req.body ?? {};

  if (!VALID_KINDS.includes(kind)) {
    throw new ValidationError({ kind: ["Invalid notification kind"] });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    throw new ValidationError({ message: ["Message is required"] });
  }

  const result = await notifyAdmins(kind, message.trim());
  if (!result.success)
    throw new AppError(result.error ?? "Failed to send", 500);

  res.json({ success: true, data: { count: result.count } });
}

/* --------------------- user: list own notifications --------------------- */

export async function listMyNotifications(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(req);
  await connection();

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const unreadOnly = req.query.unread === "true";

  const filter: any = { userId };
  if (unreadOnly) filter.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  res.json({
    data: {
      notifications: notifications.map((n: any) => ({
        ...n,
        _id: n._id.toString(),
        userId: n.userId.toString(),
      })),
      total,
      unreadCount,
      limit,
      skip,
    },
  });
}

/* ------------------------- user: mark read ------------------------------ */

export async function markNotificationRead(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(req);
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid notification ID"] });
  }

  await connection();
  const updated = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { $set: { isRead: true } },
    { new: true },
  );
  if (!updated) throw new AppError("Notification not found", 404);

  res.json({ success: true });
}

export async function markAllNotificationsRead(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(req);
  await connection();

  const result = await Notification.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true } },
  );
  res.json({ success: true, data: { updated: result.modifiedCount } });
}

/* ------------------------ user: delete one ------------------------------ */

export async function deleteNotification(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(req);
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid notification ID"] });
  }

  await connection();
  const deleted = await Notification.findOneAndDelete({ _id: id, userId });
  if (!deleted) throw new AppError("Notification not found", 404);

  res.json({ success: true });
}
