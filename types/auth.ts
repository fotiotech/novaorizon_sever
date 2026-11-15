import type { Request } from "express";

export type AppRole = "customer" | "seller" | "admin" | "support";

export interface AuthUser {
  id: string;
  role: AppRole;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

/**
 * Narrowed Request used after requireUser / requireAdmin has run.
 * Consumers cast: `const { user } = req as AuthRequest;`
 *
 * We deliberately do NOT use `declare global { namespace Express { ... } }`
 * here — Vercel's node builder does not reliably propagate global
 * augmentations across entry points, so we keep the type explicit instead.
 */
export interface AuthRequest extends Request {
  user?: AuthUser;
}
