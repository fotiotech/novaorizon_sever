import { connection } from "../config/db.js";
import { Event } from "../models/Event.js";
import { DailyStats } from "../models/DailyStats.js";
import Product from "../models/Product.js";

/* ------------------------------- hot ------------------------------------- */

export interface HotItem {
  _id: string;
  title: string | null;
  image: string | null;
  score: number;
  counts: { view: number; cart_add: number; purchase: number; like: number };
  delta: number;
}

/**
 * Top N most-engaged items in the last `windowMs`. `delta` compares
 * the current window's score against the immediately previous window
 * of the same length — e.g. 15min vs. the 15min before that.
 */
export async function getHotRightNow(
  windowMs: number,
  limit: number,
): Promise<HotItem[]> {
  await connection();
  const now = Date.now();
  const currentSince = new Date(now - windowMs);
  const previousSince = new Date(now - 2 * windowMs);
  const previousUntil = new Date(now - windowMs);

  const [current, previous] = await Promise.all([
    Event.aggregate([
      {
        $match: {
          isBot: { $ne: true },
          timestamp: { $gte: currentSince },
          itemId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$itemId",
          view: { $sum: { $cond: [{ $eq: ["$eventType", "view"] }, 1, 0] } },
          cart_add: {
            $sum: { $cond: [{ $eq: ["$eventType", "cart_add"] }, 1, 0] },
          },
          purchase: {
            $sum: { $cond: [{ $eq: ["$eventType", "purchase"] }, 1, 0] },
          },
          like: { $sum: { $cond: [{ $eq: ["$eventType", "like"] }, 1, 0] } },
          score: { $sum: "$score" },
        },
      },
    ]),
    Event.aggregate([
      {
        $match: {
          isBot: { $ne: true },
          timestamp: { $gte: previousSince, $lt: previousUntil },
          itemId: { $ne: null },
        },
      },
      { $group: { _id: "$itemId", score: { $sum: "$score" } } },
    ]),
  ]);

  const previousMap = new Map(
    previous.map((p: any) => [String(p._id), Number(p.score) || 0]),
  );
  const top = current
    .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);

  if (top.length === 0) return [];

  const ids = top.map((t: any) => t._id);
  const products = await Product.find({ _id: { $in: ids } })
    .select("name images")
    .lean();
  const productMap = new Map(
    (products as any[]).map((p) => [String(p._id), p]),
  );

  return top.map((row: any) => {
    const p: any = productMap.get(String(row._id));
    const score = Number(row.score) || 0;
    const prev = previousMap.get(String(row._id)) ?? 0;
    return {
      _id: String(row._id),
      title: p?.name ?? null,
      image:
        Array.isArray(p?.images) && p.images.length > 0 ? p.images[0] : null,
      score,
      counts: {
        view: Number(row.view) || 0,
        cart_add: Number(row.cart_add) || 0,
        purchase: Number(row.purchase) || 0,
        like: Number(row.like) || 0,
      },
      delta: score - prev,
    };
  });
}

/* ---------------------------- visitor history ---------------------------- */

export interface HistoryPoint {
  period: string;
  visitors: number;
  newVisitors: number;
  returningVisitors: number;
  events: number;
  purchases: number;
  revenue: number;
}

type HistoryPeriod = "day" | "week" | "month";

function bucketKey(day: string, period: HistoryPeriod): string {
  if (period === "day") return day;
  const d = new Date(day + "T00:00:00Z");
  if (period === "week") {
    // ISO week starts on Monday. getUTCDay() is 0=Sun..6=Sat → shift.
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - (dow - 1));
    return d.toISOString().slice(0, 10);
  }
  return day.slice(0, 7); // YYYY-MM
}

/**
 * Rolls up `DailyStats` into the requested period buckets. Each `day`
 * document already carries the counters we need, so this is a single
 * query + in-memory aggregation — no `$facet` gymnastics.
 */
export async function getVisitorHistory(
  period: HistoryPeriod,
  range: number,
): Promise<HistoryPoint[]> {
  await connection();

  const daysBack =
    period === "day" ? range : period === "week" ? range * 7 : range * 31;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack);
  const sinceKey = since.toISOString().slice(0, 10);

  const stats = await DailyStats.find({ day: { $gte: sinceKey } })
    .sort({ day: 1 })
    .lean();

  const buckets = new Map<string, HistoryPoint>();
  for (const s of stats as any[]) {
    const key = bucketKey(s.day, period);
    const point = buckets.get(key) ?? {
      period: key,
      visitors: 0,
      newVisitors: 0,
      returningVisitors: 0,
      events: 0,
      purchases: 0,
      revenue: 0,
    };
    point.visitors += Number(s.visitors) || 0;
    point.newVisitors += Number(s.newVisitors) || 0;
    point.returningVisitors += Number(s.returningVisitors) || 0;
    point.events += Number(s.events) || 0;
    point.purchases += Number(s.eventCounts?.purchase) || 0;
    point.revenue += Number(s.revenue) || 0;
    buckets.set(key, point);
  }

  return Array.from(buckets.values());
}
