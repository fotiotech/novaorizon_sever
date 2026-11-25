import { Router } from "express";
import type { Request, Response } from "express";
import { env } from "../config/env.js";

/**
 * Secret verification for the storefront's revalidation endpoint.
 * The storefront no longer needs its own copy of REVALIDATE_SECRET; it can
 * forward the caller's header here and let the API (which owns the AWS Secret)
 * compare it.
 */
export const internalRouter = Router();

internalRouter.post("/revalidate/verify", (req: Request, res: Response) => {
  const expected = env.revalidateSecret;
  if (!expected) {
    res.status(503).json({ ok: false, error: "Revalidation not configured" });
    return;
  }
  const provided = req.get("x-revalidate-secret");
  if (provided !== expected) {
    res.status(401).json({ ok: false });
    return;
  }
  res.json({ ok: true });
});
