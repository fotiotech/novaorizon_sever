import type { Request, Response } from "express";
import mongoose from "mongoose";
import BannerContent from "../models/BannerContent.js";
import Block from "../models/Block.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import {
  BANNER_ALIGNS,
  BANNER_CARD_SIZES,
  BANNER_RATIOS,
  BANNER_OVERLAYS,
  BANNER_POSITIONS,
  BANNER_STATUSES,
  BANNER_THEMES,
  BANNER_TYPES,
  CTA_STYLES,
  MAX_BANNER_HTML,
} from "../config/content.constants.js";

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

function readBool(raw: unknown, fallback = false): boolean {
  if (raw === true || raw === "true" || raw === "on") return true;
  if (raw === false || raw === "false" || raw === "off") return false;
  return fallback;
}

function readDate(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface BannerBody {
  type?: string;
  name?: string;
  eyebrow?: string;
  body?: string;
  image?: string;
  imageAlt?: string;
  videoUrl?: string;
  html?: string;
  link?: string;
  openInNewTab?: unknown;
  overlay?: string;
  ratio?: string;
  size?: string;
  align?: string;
  position?: string;
  theme?: string;
  status?: string;
  order?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  heading?: { title?: string; subtitle?: string };
  cta?: { text?: string; link?: string; style?: string };
}

function parseBannerBody(input: BannerBody) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new ValidationError({ name: ["Name is required"] });

  const type = pickEnum(input.type, BANNER_TYPES, "image");

  const image = String(input.image ?? "").trim();
  const videoUrl = String(input.videoUrl ?? "").trim();
  const html = String(input.html ?? "");

  // Type-specific media requirements. The error is attached to the field the
  // editor shows for that type, so the form can highlight it.
  if (type === "image" && !image) {
    throw new ValidationError({ image: ["Image banners need an image"] });
  }
  if (type === "video" && !videoUrl) {
    throw new ValidationError({ videoUrl: ["Video banners need a video URL"] });
  }
  if (type === "html" && !html.trim()) {
    throw new ValidationError({ html: ["HTML banners need their markup"] });
  }
  if (type === "compact" && !image) {
    throw new ValidationError({ image: ["Compact banners need a logo image"] });
  }
  if (html.length > MAX_BANNER_HTML) {
    throw new ValidationError({
      html: [`HTML is limited to ${MAX_BANNER_HTML} characters`],
    });
  }

  const heading = {
    title: String(input.heading?.title ?? "").trim(),
    subtitle: String(input.heading?.subtitle ?? "").trim(),
  };
  const eyebrow = String(input.eyebrow ?? "").trim();
  const body = String(input.body ?? "");

  if (type === "compact" && !heading.title) {
    throw new ValidationError({
      "heading.title": ["Compact banners need a title"],
    });
  }

  const cta = {
    text: String(input.cta?.text ?? "").trim(),
    link: String(input.cta?.link ?? "").trim(),
    style: pickEnum(input.cta?.style, CTA_STYLES, "none"),
  };
  if (cta.style !== "none" && !cta.link) {
    throw new ValidationError({ "cta.link": ["CTA requires a link"] });
  }

  const startAt = readDate(input.startAt);
  const endAt = readDate(input.endAt);
  if (startAt && endAt && endAt <= startAt) {
    throw new ValidationError({
      endAt: ["The schedule ends before it starts"],
    });
  }

  return {
    type,
    name,
    eyebrow,
    body,
    heading,
    image,
    imageAlt: String(input.imageAlt ?? "").trim(),
    videoUrl,
    html,
    link: String(input.link ?? "").trim(),
    openInNewTab: readBool(input.openInNewTab, false),
    overlay: pickEnum(input.overlay, BANNER_OVERLAYS, "gradient"),
    ratio: pickEnum(input.ratio, BANNER_RATIOS, "1:1"),
    size: pickEnum(input.size, BANNER_CARD_SIZES, "md"),
    align: pickEnum(input.align, BANNER_ALIGNS, "left"),
    position: pickEnum(input.position, BANNER_POSITIONS, "center"),
    theme: pickEnum(input.theme, BANNER_THEMES, "light"),
    status: pickEnum(input.status, BANNER_STATUSES, "active"),
    order: Math.max(0, Number(input.order) || 0),
    startAt,
    endAt,
    cta,
  };
}

/** Fields the admin list and pickers need, without shipping the full document. */
function toSummary(d: any) {
  return {
    _id: String(d._id),
    name: d.name,
    type: d.type ?? "image",
    status: d.status ?? "active",
    order: d.order ?? 0,
    imageUrl: d.image || null,
    startAt: d.startAt ? new Date(d.startAt).toISOString() : null,
    endAt: d.endAt ? new Date(d.endAt).toISOString() : null,
    updated_at: d.updated_at ? new Date(d.updated_at).toISOString() : null,
  };
}

/* ------------------------------- list ----------------------------------- */

export async function listBanners(_req: Request, res: Response): Promise<void> {
  await connection();
  const docs = await BannerContent.find()
    .sort({ order: 1, updated_at: -1 })
    .lean();

  res.json({ data: (docs as any[]).map(toSummary) });
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
    .select("_id name image type status")
    .sort({ order: 1, updated_at: -1 })
    .limit(60)
    .lean();

  res.json({
    data: (docs as any[]).map((d) => ({
      value: String(d._id),
      label: d.name,
      image: d.image || null,
      type: d.type ?? "image",
      status: d.status ?? "active",
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

  const doc: any = await BannerContent.findById(id)
    .select("name image type")
    .lean();
  if (!doc) throw new AppError("Banner not found", 404);

  res.json({
    data: {
      _id: String(doc._id),
      name: doc.name,
      type: doc.type ?? "image",
      imageUrl: doc.image || null,
    },
  });
}

/* ------------------------------- create --------------------------------- */

export async function createBanner(req: Request, res: Response): Promise<void> {
  const parsed = parseBannerBody(req.body ?? {});
  await connection();

  const doc = new BannerContent(parsed);
  await doc.save();
  res.status(201).json({
    success: true,
    data: JSON.parse(JSON.stringify(doc.toObject())),
  });
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