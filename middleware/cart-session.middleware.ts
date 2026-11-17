import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { isProd } from "../config/env.js";

const COOKIE_NAME = "cart_sid";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface CartSessionRequest extends Request {
  cartSessionId: string;
}

/**
 * Ensures every request through this middleware has a cart session id.
 * If the client sent `cart_sid` cookie, reuse it (so guest carts persist
 * across visits). Otherwise mint a new one and set it.
 *
 * This is guest-scoped — it does NOT identify a user. A logged-in user
 * still has a cart_sid, but cart operations prefer userId when present.
 */
export function cartSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const existing = (req as any).cookies?.[COOKIE_NAME] as string | undefined;

  let sid = existing;
  if (!sid || typeof sid !== "string" || sid.length < 10) {
    sid = crypto.randomUUID();
    res.cookie(COOKIE_NAME, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      maxAge: ONE_YEAR_MS,
      path: "/",
    });
  }

  (req as CartSessionRequest).cartSessionId = sid;
  next();
}
