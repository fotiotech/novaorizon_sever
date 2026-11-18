import type { Request, Response } from "express";
import crypto from "node:crypto";
import mongoose from "mongoose";
import NewsletterSubscriber from "../models/NewsletterSubscriber.js";
import User from "../models/User.js";
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

/* ------------------------ PUBLIC: unsubscribe --------------------------- */

export async function unsubscribeFromNewsletter(
  req: Request,
  res: Response,
): Promise<void> {
  const token = String(
    req.params?.token ?? req.body?.token ?? req.query.token ?? "",
  ).trim();
  if (!token) {
    throw new ValidationError({ token: ["Unsubscribe token is required"] });
  }

  await connection();

  const sub: any = await NewsletterSubscriber.findOne({
    unsubscribeToken: token,
  });
  if (!sub) throw new AppError("Invalid or expired unsubscribe link.", 404);

  if (sub.status === "unsubscribed") {
    res.json({ success: true, message: "You're already unsubscribed." });
    return;
  }

  sub.status = "unsubscribed";
  sub.unsubscribedAt = new Date();
  await sub.save();

  // Keep the user's marketing preference aligned with the subscription.
  if (sub.userId) {
    try {
      await User.updateOne(
        { _id: sub.userId },
        { $set: { "preferences.marketing.email": false } },
      );
    } catch (err) {
      console.error("[unsubscribeFromNewsletter] user sync failed:", err);
    }
  }

  res.json({ success: true, message: "You've been unsubscribed." });
}

/* ------------------------------ ADMIN: list ----------------------------- */

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

  const [subscribers, total, all, subscribed, unsubscribed, bounced] =
    await Promise.all([
      NewsletterSubscriber.find(query)
        .sort({ subscribedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      NewsletterSubscriber.countDocuments(query),
      NewsletterSubscriber.countDocuments({}),
      NewsletterSubscriber.countDocuments({ status: "subscribed" }),
      NewsletterSubscriber.countDocuments({ status: "unsubscribed" }),
      NewsletterSubscriber.countDocuments({ status: "bounced" }),
    ]);

  res.json({
    data: {
      subscribers: JSON.parse(JSON.stringify(subscribers)),
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
      currentPage: pageNum,
      counts: { all, subscribed, unsubscribed, bounced },
    },
  });
}

/* ---------------------------- ADMIN: export ----------------------------- */

export async function exportNewsletterCsv(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const subscribers = await NewsletterSubscriber.find({})
    .sort({ subscribedAt: -1, createdAt: -1 })
    .lean();

  const escape = (value: unknown) => {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ["email", "status", "source", "subscribedAt", "unsubscribedAt"];
  const rows = subscribers.map((s: any) =>
    [
      s.email,
      s.status,
      s.source ?? "",
      s.subscribedAt ? new Date(s.subscribedAt).toISOString() : "",
      s.unsubscribedAt ? new Date(s.unsubscribedAt).toISOString() : "",
    ]
      .map(escape)
      .join(","),
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="newsletter-subscribers.csv"',
  );
  res.send([header.join(","), ...rows].join("\n"));
}

/* ---------------------------- ADMIN: delete ----------------------------- */

export async function deleteNewsletterSubscriber(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid subscriber id"] });
  }

  await connection();
  const deleted = await NewsletterSubscriber.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Subscriber not found", 404);

  res.json({ success: true });
}
