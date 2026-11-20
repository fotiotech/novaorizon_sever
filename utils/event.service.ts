import mongoose, { Types } from "mongoose";
import { Event } from "../models/Event.js";
import { EventRollup } from "../models/EventRollup.js";
import { DailyStats } from "../models/DailyStats.js";
import { VisitorDay } from "../models/VisitorDay.js";
import Product from "../models/Product.js";
import { connection } from "../config/db.js";
import { getPusher } from "./pusher.js";
import { isBot, detectDevice } from "./bot-detection.js";

export type EventType =
  | "view"
  | "cart_add"
  | "purchase"
  | "like"
  | "unlike"
  | "share"
  | "page_view";

export interface EventHeaders {
  userAgent?: string;
  referrer?: string;
  country?: string;
  locale?: string;
}

export interface TrackEventInput {
  userId: string;
  itemId?: string;
  eventType: EventType;
  sessionId?: string;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
  headers?: EventHeaders;
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function publishEvent(payload: Record<string, any>): Promise<void> {
  const pusher = getPusher();
  if (!pusher) return;
  try {
    await pusher.trigger("analytics", "event", payload);
  } catch (err) {
    console.error("[events] pusher publish failed", err);
  }
}

/* ------------------------------- track ---------------------------------- */

export async function trackEvent(
  input: TrackEventInput,
): Promise<{ ok: true; skipped?: "bot" | "duplicate"; id?: string }> {
  await connection();
  const {
    userId,
    itemId,
    eventType,
    sessionId,
    metadata,
    idempotencyKey,
    headers,
  } = input;
  const ua = headers?.userAgent ?? "";

  if (isBot(ua)) return { ok: true, skipped: "bot" };

  if (idempotencyKey) {
    const existing = await Event.findOne({ idempotencyKey })
      .select("_id")
      .lean();
    if (existing) return { ok: true, skipped: "duplicate" };
  }

  if (itemId && !mongoose.Types.ObjectId.isValid(itemId)) {
    throw new Error(`Invalid itemId: ${itemId}`);
  }

  const scoreMap: Record<EventType, number> = {
    view: 1,
    cart_add: 3,
    purchase: 5,
    like: 2,
    unlike: -2,
    share: 3,
    page_view: 1,
  };

  const event = new Event({
    userId,
    itemId: itemId ? new Types.ObjectId(itemId) : undefined,
    eventType,
    score: scoreMap[eventType] ?? 1,
    sessionId,
    metadata,
    isBot: false,
    idempotencyKey: idempotencyKey ?? undefined,
    context: {
      userAgent: ua,
      referrer: headers?.referrer,
      country: headers?.country,
      device: detectDevice(ua),
      locale: headers?.locale,
    },
    timestamp: new Date(),
  });

  try {
    await event.save();

    const day = formatDay(event.timestamp as Date);

    const [visitorResult, priorVisit] = await Promise.all([
      VisitorDay.updateOne(
        { day, userId },
        { $setOnInsert: { day, userId, firstSeenAt: event.timestamp } },
        { upsert: true },
      ),
      VisitorDay.findOne({ userId, day: { $lt: day } })
        .select("_id")
        .lean(),
    ]);

    const isFirstToday = ((visitorResult as any).upsertedCount ?? 0) > 0;
    const isReturning = !!priorVisit;

    const inc: Record<string, number> = {
      events: 1,
      [`eventCounts.${eventType}`]: 1,
    };
    if (isFirstToday) {
      inc.visitors = 1;
      if (isReturning) inc.returningVisitors = 1;
      else inc.newVisitors = 1;
    }
    if (eventType === "purchase" && metadata?.total) {
      const total = Number(metadata.total);
      if (Number.isFinite(total)) inc.revenue = total;
    }

    await DailyStats.updateOne(
      { day },
      { $inc: inc, $set: { updatedAt: new Date() }, $setOnInsert: { day } },
      { upsert: true },
    );
  } catch (err: any) {
    if (err?.code === 11000) return { ok: true, skipped: "duplicate" };
    throw err;
  }

  void publishEvent({
    _id: String(event._id),
    userId,
    itemId: itemId ?? null,
    eventType,
    score: event.score,
    metadata: metadata ?? {},
    timestamp: event.timestamp,
  });

  return { ok: true, id: String(event._id) };
}

/* --------------------------- fetch internal ----------------------------- */

/**
 * Internal helper for the live-analytics dashboard. Uses a `since`
 * timestamp cursor — the frontend polls this endpoint.
 */
export async function getEventsSince(
  since: number,
  limit = 50,
): Promise<any[]> {
  await connection();
  // Take the *newest* `limit` events, then return them ascending — the live
  // feed appends and relies on ascending order.
  const events = await Event.find({
    isBot: { $ne: true },
    timestamp: { $gt: new Date(since) },
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  events.reverse();

  // Batch-fetch product info for events that have an itemId
  const itemIds = events
    .map((e: any) => e.itemId)
    .filter((id: any) => id)
    .map((id: any) => String(id));

  if (itemIds.length === 0) return events;

  const products =
    (await mongoose.models.Product?.find({ _id: { $in: itemIds } })
      .select("name images slug price")
      .lean()) ?? [];

  const productMap = new Map(
    (products as any[]).map((p: any) => [String(p._id), p]),
  );

  return events.map((e: any) => {
    const p: any = e.itemId ? productMap.get(String(e.itemId)) : null;
    return {
      ...e,
      product: p
        ? {
            _id: String(p._id),
            title: p.name,
            image:
              Array.isArray(p.images) && p.images.length > 0
                ? p.images[0]
                : undefined,
            price: p.price,
            slug: p.slug,
          }
        : null,
    };
  });
}

/* --------------------------- recommendations ---------------------------- */

export async function getRecommendations(
  userId: string,
  limit = 10,
): Promise<any[]> {
  await connection();

  const userInteractions = await Event.find({ userId, isBot: false })
    .select("itemId")
    .lean();
  const interactedIds = userInteractions
    .map((i: any) => i.itemId)
    .filter(Boolean);

  if (interactedIds.length === 0) return getTrendingItemsImpl(limit);

  return Event.aggregate([
    {
      $match: {
        isBot: { $ne: true },
        itemId: { $in: interactedIds },
        userId: { $ne: userId },
      },
    },
    {
      $group: {
        _id: "$userId",
        items: { $addToSet: "$itemId" },
        totalScore: { $sum: "$score" },
      },
    },
    { $sort: { totalScore: -1 } },
    { $limit: 20 },
    { $unwind: "$items" },
    { $match: { items: { $nin: interactedIds } } },
    { $group: { _id: "$items", recommendationScore: { $sum: "$totalScore" } } },
    { $sort: { recommendationScore: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    { $match: { product: { $ne: null }, "product.status": "active" } },
    { $replaceRoot: { newRoot: "$product" } },
  ]);
}

/* ------------------------------ trending -------------------------------- */

export async function getTrendingItemsImpl(limit = 10): Promise<any[]> {
  await connection();

  const trending = await Event.aggregate([
    {
      $match: {
        isBot: { $ne: true },
        timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    },
    {
      $group: {
        _id: "$itemId",
        viewCount: { $sum: { $cond: [{ $eq: ["$eventType", "view"] }, 1, 0] } },
        purchaseCount: {
          $sum: { $cond: [{ $eq: ["$eventType", "purchase"] }, 1, 0] },
        },
      },
    },
    {
      $addFields: {
        score: { $add: ["$viewCount", { $multiply: ["$purchaseCount", 3] }] },
      },
    },
    { $sort: { score: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    { $match: { "product.status": "active" } },
    { $replaceRoot: { newRoot: "$product" } },
  ]);

  if (trending.length === 0) {
    return Product.find({ status: "active" })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
  return trending;
}

export async function getTrendingItemsFast(
  days = 7,
  limit = 10,
): Promise<any[]> {
  await connection();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return EventRollup.aggregate([
    { $match: { bucket: { $gte: since }, itemId: { $ne: null } } },
    { $group: { _id: "$itemId", score: { $sum: "$totalScore" } } },
    { $sort: { score: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    { $match: { "product.status": "active" } },
    { $replaceRoot: { newRoot: "$product" } },
  ]);
}

/* --------------------------- recently viewed ---------------------------- */

export async function getRecentlyViewed(
  userId: string,
  limit = 5,
): Promise<any[]> {
  await connection();
  return Event.aggregate([
    { $match: { userId, isBot: { $ne: true }, eventType: "view" } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: "$itemId", lastViewedAt: { $first: "$timestamp" } } },
    { $sort: { lastViewedAt: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    { $match: { "product.status": "active" } },
    { $replaceRoot: { newRoot: "$product" } },
  ]);
}

/* --------------------------- guest merging ------------------------------ */

export async function mergeGuestEventsService(
  guestId: string,
  userId: string,
): Promise<void> {
  await connection();
  await Event.updateMany({ userId: guestId }, { $set: { userId } });
}

/* -------------------------- related products ---------------------------- */

export async function getRelatedProducts(
  productId: string,
  limit = 10,
): Promise<any[]> {
  await connection();
  if (!mongoose.Types.ObjectId.isValid(productId)) return [];

  const product: any = await Product.findById(productId)
    .select("relatedProducts categoryId brand")
    .lean();
  if (!product) return [];

  const relatedRefs = Array.isArray(product.relatedProducts)
    ? product.relatedProducts
    : [];

  const relatedIds = relatedRefs
    .map((r: any) => {
      if (!r) return null;
      if (typeof r === "string") return r;
      if (r.product) return r.product;
      if (r.id) return r.id;
      if (r._id) return r._id;
      return null;
    })
    .filter((id: any) => id && mongoose.Types.ObjectId.isValid(id))
    .map((id: any) => new mongoose.Types.ObjectId(id));

  let products: any[] = [];

  if (relatedIds.length > 0) {
    products = await Product.find({
      _id: { $in: relatedIds },
      status: "active",
    })
      .limit(limit)
      .lean();
  }

  if (products.length === 0) {
    const fallbackQuery: any = {
      _id: { $ne: new mongoose.Types.ObjectId(productId) },
      status: "active",
    };
    if (product.categoryId) fallbackQuery.categoryId = product.categoryId;
    else if (product.brand) fallbackQuery.brand = product.brand;
    products = await Product.find(fallbackQuery).limit(limit).lean();
  }

  return products;
}

/* -------------------------------- likes --------------------------------- */

export interface LikeState {
  liked: boolean;
  count: number;
}

export async function getLikeStates(
  itemIds: string[],
  userId: string | null,
): Promise<Record<string, LikeState>> {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return {};
  const validIds = itemIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length === 0) return {};

  await connection();
  const objIds = validIds.map((id) => new Types.ObjectId(id));

  const [counts, mine] = await Promise.all([
    Event.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          itemId: { $in: objIds },
          eventType: { $in: ["like", "unlike"] },
        },
      },
      { $sort: { timestamp: -1, _id: -1 } },
      {
        $group: {
          _id: { itemId: "$itemId", userId: "$userId" },
          lastType: { $first: "$eventType" },
        },
      },
      { $match: { lastType: "like" } },
      { $group: { _id: "$_id.itemId", count: { $sum: 1 } } },
    ]),
    userId
      ? Event.aggregate<{ _id: Types.ObjectId }>([
          {
            $match: {
              userId,
              itemId: { $in: objIds },
              eventType: { $in: ["like", "unlike"] },
            },
          },
          { $sort: { timestamp: -1, _id: -1 } },
          { $group: { _id: "$itemId", lastType: { $first: "$eventType" } } },
          { $match: { lastType: "like" } },
        ])
      : Promise.resolve([] as { _id: Types.ObjectId }[]),
  ]);

  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  const likedSet = new Set(mine.map((m) => String(m._id)));

  const out: Record<string, LikeState> = {};
  for (const id of validIds) {
    out[id] = { liked: likedSet.has(id), count: countMap.get(id) ?? 0 };
  }
  return out;
}

export async function toggleLike(
  userId: string,
  itemId: string,
  headers: EventHeaders,
): Promise<LikeState> {
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new Error("Invalid itemId");
  }

  await connection();
  const _id = new Types.ObjectId(itemId);

  const last = await Event.findOne({
    userId,
    itemId: _id,
    eventType: { $in: ["like", "unlike"] },
  })
    .sort({ timestamp: -1, _id: -1 })
    .select("eventType")
    .lean();

  const currentlyLiked = (last as any)?.eventType === "like";
  const nextType: "like" | "unlike" = currentlyLiked ? "unlike" : "like";

  await trackEvent({ userId, itemId, eventType: nextType, headers });

  const states = await getLikeStates([itemId], userId);
  return states[itemId] ?? { liked: false, count: 0 };
}