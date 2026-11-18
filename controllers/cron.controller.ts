import type { Request, Response } from "express";
import { Event } from "../models/Event.js";
import { DailyStats } from "../models/DailyStats.js";
import { connection } from "../config/db.js";
import { rollupEvents } from "../utils/cron/rollup-events.js";
import { refreshProductMetrics } from "../utils/cron/refresh-product-metrics.js";
import { AppError } from "../middleware/error.middleware.js";

/**
 * Daily analytics snapshot (cron).
 *
 * Recomputes yesterday's visitor/event rollup from the raw events so the
 * dashboard never drifts. Protected by `CRON_SECRET` (Bearer token).
 */
function assertCron(req: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    throw new AppError("Unauthorized", 401);
  }
}

export async function dailySnapshot(
  req: Request,
  res: Response,
): Promise<void> {
  assertCron(req);

  await connection();

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const day = yesterday.toISOString().slice(0, 10);

  const next = new Date(yesterday);
  next.setUTCDate(next.getUTCDate() + 1);

  const events = await Event.find({
    isBot: { $ne: true },
    timestamp: { $gte: yesterday, $lt: next },
  })
    .select("userId eventType metadata")
    .lean();

  const uniqueUsers = new Set<string>();
  const eventCounts: Record<string, number> = {};
  let revenue = 0;

  for (const e of events as any[]) {
    uniqueUsers.add(String(e.userId));
    eventCounts[e.eventType] = (eventCounts[e.eventType] ?? 0) + 1;
    if (e.eventType === "purchase" && e.metadata?.total) {
      revenue += Number(e.metadata.total) || 0;
    }
  }

  await DailyStats.updateOne(
    { day },
    {
      $set: {
        visitors: uniqueUsers.size,
        events: events.length,
        eventCounts: {
          view: eventCounts.view ?? 0,
          cart_add: eventCounts.cart_add ?? 0,
          purchase: eventCounts.purchase ?? 0,
          like: eventCounts.like ?? 0,
          page_view: eventCounts.page_view ?? 0,
        },
        revenue,
        updatedAt: new Date(),
      },
      $setOnInsert: { day, newVisitors: 0, returningVisitors: 0 },
    },
    { upsert: true },
  );

  res.json({ ok: true, day, visitors: uniqueUsers.size });
}
/* --------------------------- event rollups ------------------------------ */

/** POST /api/cron/rollup — rebuild the last 7 days of hourly buckets. */
export async function rollupEventsJob(
  req: Request,
  res: Response,
): Promise<void> {
  assertCron(req);
  const result = await rollupEvents();
  res.json(result);
}

/** POST /api/cron/product-metrics — refresh denormalized product metrics. */
export async function productMetricsJob(
  req: Request,
  res: Response,
): Promise<void> {
  assertCron(req);
  const result = await refreshProductMetrics();
  res.json(result);
}
