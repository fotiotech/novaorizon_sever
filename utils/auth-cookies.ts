import type { Request } from "express";
import { env, isProd } from "../config/env.js";

/**
 * Admin and storefront sessions are deliberately separate.
 *
 * One backend serves both apps, and browsers send every cookie that matches
 * the API's domain. With a single `session` cookie, signing in to the admin
 * console replaced the customer's storefront session (and vice versa) — the
 * "user switches when I log in on the other app" bug.
 *
 * The audience is chosen by each app via the `x-auth-audience` header
 * (`admin` | `client`). Login/logout also accept it in the body so plain
 * fetch calls can pass it.
 */
export type AuthAudience = "client" | "admin";

export const CLIENT_SESSION_COOKIE = "session";
export const ADMIN_SESSION_COOKIE = "session_admin";

export const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionCookieName(audience: AuthAudience): string {
  return audience === "admin" ? ADMIN_SESSION_COOKIE : CLIENT_SESSION_COOKIE;
}

export function resolveAudience(req: Request): AuthAudience {
  const header = String(req.headers["x-auth-audience"] ?? "").toLowerCase();
  const body = (req.body as { audience?: unknown } | undefined)?.audience;
  const query = req.query?.audience;
  const raw = String(header || body || query || "").toLowerCase();
  return raw === "admin" ? "admin" : "client";
}

export function readSessionToken(
  req: Request,
  audience: AuthAudience,
): string | null {
  const value = (req as unknown as { cookies?: Record<string, unknown> }).cookies?.[
    sessionCookieName(audience)
  ];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function cookieOptions(maxAgeMs: number = COOKIE_MAX_AGE_MS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    domain: env.cookieDomain || undefined,
    path: "/",
    maxAge: maxAgeMs,
  };
}