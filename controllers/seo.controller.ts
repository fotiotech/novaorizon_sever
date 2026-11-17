import type { Request, Response } from "express";
import SeoSetting from "../models/SeoSetting.js";
import { connection } from "../config/db.js";
import {
  DEFAULT_SEO,
  type SeoForm,
  type RobotsValue,
} from "../config/seo-defaults.js";

const SINGLETON_KEY = "default";

function normalizeRobots(value: unknown): RobotsValue {
  return value === "noindex,nofollow" ? "noindex,nofollow" : "index,follow";
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export async function getSeoSetting(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const doc: any = await SeoSetting.findOne({ key: SINGLETON_KEY }).lean();

  if (!doc) {
    res.json({ data: DEFAULT_SEO });
    return;
  }

  const data: SeoForm = {
    siteName: asString(doc.siteName, DEFAULT_SEO.siteName),
    title: asString(doc.title, DEFAULT_SEO.title),
    description: asString(doc.description, DEFAULT_SEO.description),
    keywords: asString(doc.keywords, DEFAULT_SEO.keywords),
    canonicalUrl: asString(doc.canonicalUrl, DEFAULT_SEO.canonicalUrl),
    ogImage: asString(doc.ogImage, DEFAULT_SEO.ogImage),
    robots: normalizeRobots(doc.robots),
  };
  res.json({ data });
}

export async function saveSeoSetting(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const input = (req.body ?? {}) as Partial<SeoForm>;

  const data = {
    siteName: String(input.siteName ?? "").trim(),
    title: String(input.title ?? "").trim(),
    description: String(input.description ?? "").trim(),
    keywords: String(input.keywords ?? "").trim(),
    canonicalUrl: String(input.canonicalUrl ?? "").trim(),
    ogImage: String(input.ogImage ?? "").trim(),
    robots: normalizeRobots(input.robots),
  };

  await SeoSetting.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $set: data, $setOnInsert: { key: SINGLETON_KEY } },
    { upsert: true, new: true },
  );

  res.json({ success: true });
}
