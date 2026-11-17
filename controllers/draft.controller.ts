import type { Request, Response } from "express";
import { ValidationError } from "../middleware/error.middleware.js";
import {
  deleteProductDraftForUser,
  getProductDraftForUser,
  saveProductDraftForUser,
} from "../utils/draft.service.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function saveProductDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "productId");
  if (!productId) throw new ValidationError({ productId: ["required"] });
  const data = req.body?.data ?? req.body;
  await saveProductDraftForUser(req.user!.id, productId, data);
  res.json({ success: true });
}

export async function getProductDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "productId");
  const draft = await getProductDraftForUser(req.user!.id, productId);
  res.json({ data: draft });
}

export async function deleteProductDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "productId");
  await deleteProductDraftForUser(req.user!.id, productId);
  res.json({ success: true });
}
