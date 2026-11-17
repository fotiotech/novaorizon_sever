import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import { ForbiddenError, UnauthorizedError } from "./error.middleware.js";

const SESSION_COOKIE = "session";

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
  const cookie = (req as any).cookies?.[SESSION_COOKIE];
  return typeof cookie === "string" && cookie.length > 0 ? cookie : null;
}

export function requireUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = readToken(req);
    if (!token) return next(new UnauthorizedError());

    const claims = verifyToken(token);
    req.user = {
      id: claims.sub,
      role: claims.role,
      email: claims.email ?? null,
      name: claims.name ?? null,
      image: claims.image ?? null,
    };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}

/**
 * Populates `req.user` when a valid token is present, but does NOT
 * reject anonymous callers. A present-but-invalid token still throws
 * (401) — that's a real bug worth surfacing.
 *
 * Use on endpoints where the response varies based on auth state
 * (e.g. `/auth/signup` — customer OR staff path).
 */
export function optionalUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = readToken(req);
  if (!token) return next(); // no token, continue as anonymous

  try {
    const claims = verifyToken(token);
    req.user = {
      id: claims.sub,
      role: claims.role,
      email: claims.email ?? null,
      name: claims.name ?? null,
      image: claims.image ?? null,
    };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireUser(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== "admin") return next(new ForbiddenError());
    next();
  });
}

export function requireSeller(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireUser(req, res, (err) => {
    if (err) return next(err);
    const role = req.user?.role;
    if (role !== "seller" && role !== "admin")
      return next(new ForbiddenError());
    next();
  });
}
