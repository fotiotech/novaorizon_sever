import type { Request, Response } from "express";
import { ValidationError } from "../middleware/error.middleware.js";
import {
  deleteCategoryPropertyDraftForUser,
  getCategoryPropertyDraftForUser,
  saveCategoryPropertyDraftForUser,
} from "../utils/draft.service.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function getCategoryPropertyDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const key = param(req, "key");
  if (!key) throw new ValidationError({ key: ["Draft key is required"] });
  const draft = await getCategoryPropertyDraftForUser(req.user!.id, key);
  res.json({ data: draft });
}

export async function saveCategoryPropertyDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const key = param(req, "key");
  if (!key) throw new ValidationError({ key: ["Draft key is required"] });

  const { version, data } = req.body ?? {};
  if (typeof version !== "number" || data === undefined) {
    throw new ValidationError({
      version: typeof version === "number" ? undefined : ["version required"],
      data: data === undefined ? undefined : ["data required"],
    });
  }

  const { savedAt } = await saveCategoryPropertyDraftForUser(
    req.user!.id,
    key,
    version,
    data,
  );
  res.json({ data: { savedAt } });
}

export async function deleteCategoryPropertyDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const key = param(req, "key");
  if (!key) throw new ValidationError({ key: ["Draft key is required"] });
  await deleteCategoryPropertyDraftForUser(req.user!.id, key);
  res.json({ success: true });
}
