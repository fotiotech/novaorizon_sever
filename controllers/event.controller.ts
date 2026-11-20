import type { Request, Response } from "express";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import {
  trackEvent as trackEventService,
  getEventsSince as getEventsSinceService,
  getRecommendations as getRecommendationsService,
  getTrendingItemsImpl,
  getRecentlyViewed as getRecentlyViewedService,
  mergeGuestEventsService,
  getRelatedProducts as getRelatedProductsService,
  getTrendingItemsFast as getTrendingItemsFastService,
  getLikeStates as getLikeStatesService,
  toggleLike as toggleLikeService,
  type EventType,
  type EventHeaders,
} from "../utils/event.service.js";
import type { CartSessionRequest } from "../middleware/cart-session.middleware.js";

const VALID_EVENT_TYPES: EventType[] = [
  "view",
  "cart_add",
  "purchase",
  "like",
  "unlike",
  "share",
  "page_view",
];

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function authenticatedUserId(req: Request): string | undefined {
  return (req as Request & { user?: { id?: string } }).user?.id;
}

function deriveHeaders(req: Request): EventHeaders {
  return {
    userAgent: req.get("user-agent") ?? "",
    referrer: req.get("referer") ?? undefined,
    country:
      (req.get("x-vercel-ip-country") ?? req.get("cf-ipcountry")) || undefined,
    locale: req.get("accept-language")?.split(",")[0],
  };
}

function deriveGuestId(req: Request): string | null {
  // Prefer the browser-side guest cookie (stable across server-to-server
  // tracking calls); fall back to the API's cart session.
  const guestCookie = (req as unknown as { cookies?: Record<string, unknown> })
    .cookies?.guestId;
  if (typeof guestCookie === "string" && guestCookie.length >= 8) {
    return guestCookie;
  }
  return (req as CartSessionRequest).cartSessionId ?? null;
}

/* -------------------------------- track --------------------------------- */

export async function trackEvent(req: Request, res: Response): Promise<void> {
  const body = req.body ?? {};
  const eventType = String(body.eventType ?? "");

  if (!VALID_EVENT_TYPES.includes(eventType as EventType)) {
    throw new ValidationError({ eventType: ["Invalid eventType"] });
  }

  // Prefer the authenticated user; fall back to the cart session id for
  // anonymous visitors. If neither is present, the request isn't tracking-
  // eligible — reply cleanly rather than writing a doc with a null userId.
  const userId =
    authenticatedUserId(req) ??
    deriveGuestId(req) ??
    (typeof body.sessionId === "string" && body.sessionId.length >= 8
      ? body.sessionId
      : null);
  if (!userId) {
    res.json({ ok: true, skipped: "anonymous" });
    return;
  }

  const result = await trackEventService({
    userId,
    itemId: body.itemId,
    eventType: eventType as EventType,
    sessionId: body.sessionId,
    metadata: body.metadata,
    idempotencyKey: body.idempotencyKey,
    headers: deriveHeaders(req),
  });

  res.json(result);
}

/* --------------------------- live-feed polling -------------------------- */

/**
 * Internal dashboard use — returns events newer than `since` (ms epoch).
 * Used by the analytics live-view component when it polls.
 */
export async function getEventsSince(
  req: Request,
  res: Response,
): Promise<void> {
  const since = Number(req.query.since) || Date.now() - 60_000;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const data = await getEventsSinceService(since, limit);
  res.json({ data });
}

/* --------------------------- recommendations ---------------------------- */

export async function getRecommendations(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(req);
  if (!userId) throw new AppError("Authentication required", 401);

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const data = await getRecommendationsService(userId, limit);
  res.json({ data });
}

export async function getTrendingItems(
  req: Request,
  res: Response,
): Promise<void> {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const data = await getTrendingItemsImpl(limit);
  res.json({ data });
}

export async function getRecentlyViewed(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(req);
  if (!userId) throw new AppError("Authentication required", 401);

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 5));
  const data = await getRecentlyViewedService(userId, limit);
  res.json({ data });
}

export async function getTrendingItemsFast(
  req: Request,
  res: Response,
): Promise<void> {
  const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const data = await getTrendingItemsFastService(days, limit);
  res.json({ data });
}

/* ---------------------------- guest merging ----------------------------- */

export async function mergeGuestEvents(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(req);
  if (!userId) throw new AppError("Authentication required", 401);

  const guestId = deriveGuestId(req);
  if (!guestId) {
    res.json({ success: true, merged: false });
    return;
  }

  await mergeGuestEventsService(guestId, userId);
  res.json({ success: true, merged: true });
}

/* -------------------------- related products ---------------------------- */

export async function getRelatedProducts(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "productId");
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const data = await getRelatedProductsService(productId, limit);
  res.json({ data });
}

/* -------------------------------- likes --------------------------------- */

export async function getLikeStates(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = req.query.ids;
  const itemIds =
    typeof raw === "string"
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : Array.isArray(raw)
        ? (raw as string[])
        : [];

  if (itemIds.length === 0) {
    res.json({ data: {} });
    return;
  }
  if (itemIds.length > 100) {
    throw new ValidationError({ ids: ["At most 100 ids per request"] });
  }

  const data = await getLikeStatesService(
    itemIds,
    authenticatedUserId(req) ?? null,
  );
  res.json({ data });
}

export async function toggleLike(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(req);
  if (!userId) throw new AppError("Authentication required", 401);

  const itemId = String(req.body?.itemId ?? "");
  if (!itemId) throw new ValidationError({ itemId: ["required"] });

  const state = await toggleLikeService(userId, itemId, deriveHeaders(req));
  res.json({ data: state });
}