import type { Request, Response } from "express";
import crypto from "node:crypto";
import mongoose from "mongoose";
import NewsletterSubscriber from "../models/NewsletterSubscriber.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { consumeRateLimit, getClientIp } from "../utils/rate-limit.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function makeToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/* -------------------------- PUBLIC: subscribe --------------------------- */

export async function subscribeToNewsletter(
  req: Request,
  res: Response,
): Promise<void> {
  const ip = getClientIp(req as any);
  const limit = consumeRateLimit(`newsletter:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    throw new AppError("Too many requests. Please try again later.", 429);
  }

  await connection();

  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) throw new ValidationError({ email: ["Email required"] });
  if (!EMAIL_REGEX.test(email)) {
    throw new ValidationError({ email: ["Invalid email"] });
  }

  const existing = await NewsletterSubscriber.findOne({ email });

  if (existing) {
    if (existing.status === "subscribed") {
      res.json({ success: true, message: "You're already subscribed." });
      return;
    }
    existing.status = "subscribed";
    existing.subscribedAt = new Date();
    existing.unsubscribedAt = null;
    if (!existing.unsubscribeToken) existing.unsubscribeToken = makeToken();
    await existing.save();
    res.json({
      success: true,
      message: "Welcome back! You're subscribed again.",
    });
    return;
  }

  await NewsletterSubscriber.create({
    email,
    source: String(req.body?.source ?? "footer"),
    userId: req.body?.userId ?? req.user?.id ?? null,
    unsubscribeToken: makeToken(),
    status: "subscribed",
    subscribedAt: new Date(),
  });

  res.status(201).json({ success: true, message: "Thanks for subscribing!" });
}

/* ------------------------- PUBLIC: unsubscribe -------------------------- */

export async function unsubscribeFromNewsletter(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const token = param(req, "token");
  if (!token) throw new ValidationError({ token: ["required"] });

  const sub = await NewsletterSubscriber.findOne({ unsubscribeToken: token });
  if (!sub) throw new AppError("Invalid or expired unsubscribe link.", 404);

  if (sub.status === "unsubscribed") {
    res.json({ success: true, message: "You're already unsubscribed." });
    return;
  }

  sub.status = "unsubscribed";
  sub.unsubscribedAt = new Date();
  await sub.save();
  res.json({ success: true, message: "You've been unsubscribed." });
}

/* --------------------------- ADMIN: list ------------------------------- */

export async function getNewsletterSubscribers(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const {
    status,
    search,
    page = "1",
    limit = "20",
  } = req.query as Record<string, string | undefined>;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query: Record<string, any> = {};
  if (status && status !== "all") query.status = status;
  if (search) query.email = new RegExp(search, "i");

  const [subscribers, total, subscribed, unsubscribed, bounced] =
    await Promise.all([
      NewsletterSubscriber.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      NewsletterSubscriber.countDocuments(query),
      NewsletterSubscriber.countDocuments({ status: "subscribed" }),
      NewsletterSubscriber.countDocuments({ status: "unsubscribed" }),
      NewsletterSubscriber.countDocuments({ status: "bounced" }),
    ]);

  res.json({
    data: {
      subscribers: subscribers.map((s: any) => ({
        ...s,
        _id: s._id.toString(),
        createdAt: s.createdAt?.toISOString?.() ?? s.createdAt,
        subscribedAt: s.subscribedAt?.toISOString?.() ?? s.subscribedAt,
        unsubscribedAt:
          s.unsubscribedAt?.toISOString?.() ?? s.unsubscribedAt ?? null,
      })),
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      counts: {
        all: subscribed + unsubscribed + bounced,
        subscribed,
        unsubscribed,
        bounced,
      },
    },
  });
}

export async function deleteNewsletterSubscriber(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid ID"] });
  }
  const deleted = await NewsletterSubscriber.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Subscriber not found", 404);
  res.json({ success: true });
}

export async function exportNewsletterCsv(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const subs = await NewsletterSubscriber.find({ status: "subscribed" })
    .sort({ subscribedAt: -1 })
    .lean();

  const rows = [
    ["email", "status", "source", "subscribedAt"],
    ...subs.map((s: any) => [
      s.email,
      s.status,
      s.source || "",
      s.subscribedAt ? new Date(s.subscribedAt).toISOString() : "",
    ]),
  ];

  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="newsletter.csv"');
  res.send(csv);
}
