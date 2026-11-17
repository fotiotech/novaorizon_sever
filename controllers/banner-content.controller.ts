import type { Request, Response } from "express";
import mongoose from "mongoose";
import BannerContent from "../models/BannerContent.js";
import Block from "../models/Block.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { CTA_STYLES } from "../config/content.constants.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function pickEnum<T extends readonly string[]>(
  raw: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  const s = String(raw ?? "");
  return (allowed as readonly string[]).includes(s)
    ? (s as T[number])
    : fallback;
}

interface BannerBody {
  name?: string;
  eyebrow?: string;
  body?: string;
  image?: string;
  heading?: { title?: string; subtitle?: string };
  cta?: { text?: string; link?: string; style?: string };
}

interface ParsedBanner {
  name: string;
  eyebrow: string;
  body: string;
  image: string;
  heading: { title: string; subtitle: string };
  cta: { text: string; link: string; style: (typeof CTA_STYLES)[number] };
}

function parseBannerBody(input: BannerBody): ParsedBanner {
  const name = String(input.name ?? "").trim();
  if (!name) throw new ValidationError({ name: ["Name is required"] });

  const heading = {
    title: String(input.heading?.title ?? "").trim(),
    subtitle: String(input.heading?.subtitle ?? "").trim(),
  };
  const eyebrow = String(input.eyebrow ?? "").trim();
  const body = String(input.body ?? "");
  const image = String(input.image ?? "").trim();

  const cta = {
    text: String(input.cta?.text ?? "").trim(),
    link: String(input.cta?.link ?? "").trim(),
    style: pickEnum(input.cta?.style, CTA_STYLES, "none"),
  };

  const hasAnyContent =
    Boolean(heading.title) || Boolean(body) || Boolean(image);
  if (!hasAnyContent) {
    throw new ValidationError({
      _form: ["Banner needs at least a headline, body, or image."],
    });
  }

  if (cta.style !== "none" && !cta.link) {
    throw new ValidationError({ "cta.link": ["CTA requires a link"] });
  }

  return { name, eyebrow, body, image, heading, cta };
}

/* ------------------------------- list ----------------------------------- */

export async function listBanners(_req: Request, res: Response): Promise<void> {
  await connection();
  const docs = await BannerContent.find().sort({ updated_at: -1 }).lean();

  res.json({
    data: (docs as any[]).map((d) => ({
      _id: String(d._id),
      name: d.name,
      imageUrl: d.image || null,
      updated_at: d.updated_at ? new Date(d.updated_at).toISOString() : null,
    })),
  });
}

export async function getBanner(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid banner ID"] });
  }
  await connection();
  const doc = await BannerContent.findById(id).lean();
  if (!doc) throw new AppError("Banner not found", 404);
  res.json({ data: JSON.parse(JSON.stringify(doc)) });
}

export async function fetchBannerOptions(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const search = String(req.query.search ?? "").trim();

  const filter: Record<string, any> = {};
  if (search)
    filter.name = {
      $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };

  const docs = await BannerContent.find(filter)
    .select("_id name image")
    .sort({ updated_at: -1 })
    .limit(60)
    .lean();

  res.json({
    data: (docs as any[]).map((d) => ({
      value: String(d._id),
      label: d.name,
      image: d.image || null,
    })),
  });
}

export async function getBannerPreview(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid banner ID"] });
  }
  await connection();

  const doc: any = await BannerContent.findById(id).select("name image").lean();
  if (!doc) throw new AppError("Banner not found", 404);

  res.json({
    data: {
      _id: String(doc._id),
      name: doc.name,
      imageUrl: doc.image || null,
    },
  });
}

/* ------------------------------- create --------------------------------- */

export async function createBanner(req: Request, res: Response): Promise<void> {
  const parsed = parseBannerBody(req.body ?? {});
  await connection();

  try {
    const doc = new BannerContent(parsed);
    await doc.save();
    res
      .status(201)
      .json({
        success: true,
        data: JSON.parse(JSON.stringify(doc.toObject())),
      });
  } catch (err: any) {
    console.error("[createBanner]", err);
    throw new AppError(err?.message ?? "Failed to create banner", 500);
  }
}

/* ------------------------------- update --------------------------------- */

export async function updateBanner(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid banner ID"] });
  }
  const parsed = parseBannerBody(req.body ?? {});
  await connection();

  const updated = await BannerContent.findByIdAndUpdate(id, parsed, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new AppError("Banner not found", 404);

  res.json({
    success: true,
    data: JSON.parse(JSON.stringify(updated.toObject())),
  });
}

/* ------------------------------- delete --------------------------------- */

export async function deleteBanner(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid banner ID"] });
  }
  await connection();

  const usage = await Block.countDocuments({ "source.bannerIds": id });
  if (usage > 0) {
    throw new AppError(
      `Cannot delete: ${usage} block${usage === 1 ? "" : "s"} still reference this banner. Remove those references first.`,
      409,
    );
  }

  const deleted = await BannerContent.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Banner not found", 404);
  res.json({ success: true });
}
