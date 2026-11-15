import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import { ForbiddenError, UnauthorizedError } from "./error.middleware.js";
import type { AuthRequest } from "../types/auth.js";

function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export function requireUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = readBearer(req);
    if (!token) return next(new UnauthorizedError());

    const claims = verifyToken(token);
    (req as AuthRequest).user = {
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
    if ((req as AuthRequest).user?.role !== "admin") {
      return next(new ForbiddenError());
    }
    next();
  });
}
