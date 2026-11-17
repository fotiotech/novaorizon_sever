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
 * Prefer reading `req.user` directly — the global augmentation below
 * makes it available on every `Request` in the codebase.
 */
export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Global augmentation — makes `req.user` available on every Express
 * `Request` without casting. Works reliably under TypeScript 5.7.3
 * because this file is included in the tsconfig program (`include`
 * pattern) and imported via the auth middleware chain.
 *
 * Do NOT move this into a standalone `.d.ts` file — Vercel's Node
 * builder (and TS 7 native) don't reliably propagate `.d.ts` global
 * augmentations across per-entry-point compilations.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
