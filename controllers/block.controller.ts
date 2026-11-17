import type { Request, Response } from "express";
import mongoose from "mongoose";
import Block from "../models/Block.js";
import BannerContent from "../models/BannerContent.js";
import { Collection } from "../models/Collection.js";
import Category from "../models/Category.js";
import Promotion from "../models/Promotion.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import {
  BLOCK_LOCATIONS,
  BLOCK_DISPLAYS,
  BLOCK_SOURCE_TYPES,
  PROMOTION_MODES,
  BLOCK_REF_MODELS,
  BLOCK_THEMES,
  BLOCK_ANIMATIONS,
  BLOCK_ALIGNMENTS,
  CTA_STYLES,
  CARD_SHAPES,
  CARD_RATIOS,
  CARD_SIZES,
  CARD_LAYOUTS,
  TITLE_POSITIONS,
  IMAGE_POSITIONS,
  MAX_BLOCK_LIMIT,
  type BlockLocation,
} from "../config/content.constants.js";

const MAX_BANNERS_PER_BLOCK = 20;

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

function readBool(value: any, dflt = false): boolean {
  if (value === undefined || value === null) return dflt;
  if (
    value === true ||
    value === "true" ||
    value === "on" ||
    value === "1" ||
    value === 1
  )
    return true;
  if (value === false || value === "false" || value === "0" || value === 0)
    return false;
  return dflt;
}

function readNum(value: any, dflt: number): number {
  if (value === undefined || value === null) return dflt;
  const n = Number(value);
  return Number.isFinite(n) ? n : dflt;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function readColor(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s === "transparent") return "transparent";
  if (HEX_RE.test(s)) return s;
  return "";
}

function readIdArray(raw: any, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is string =>
        typeof x === "string" && mongoose.Types.ObjectId.isValid(x),
    )
    .slice(0, limit);
}

/* ----------------------- source preview --------------------------------- */

export async function getSourcePreview(
  req: Request,
  res: Response,
): Promise<void> {
  const sourceType = param(req, "sourceType");
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid source ID"] });
  }
  await connection();

  if (sourceType === "collection") {
    const doc: any = await Collection.findById(id)
      .select("name imageUrl type targetType status")
      .lean();
    if (!doc) throw new AppError("Not found", 404);
    res.json({
      data: {
        _id: String(doc._id),
        name: doc.name,
        imageUrl: doc.imageUrl ?? null,
        meta: {
          type: doc.type,
          targetType: doc.targetType,
          status: doc.status,
        },
      },
    });
    return;
  }
  if (sourceType === "category") {
    const doc: any = await Category.findById(id)
      .select("name imageUrl slug status")
      .lean();
    if (!doc) throw new AppError("Not found", 404);
    const img = Array.isArray(doc.imageUrl)
      ? (doc.imageUrl[0] ?? null)
      : (doc.imageUrl ?? null);
    res.json({
      data: {
        _id: String(doc._id),
        name: doc.name,
        imageUrl: img,
        meta: { slug: doc.slug, status: doc.status },
      },
    });
    return;
  }
  if (sourceType === "promotion") {
    const doc: any = await Promotion.findById(id)
      .select(
        "name imageUrl code isActive startDate endDate promotionType.calculationType",
      )
      .lean();
    if (!doc) throw new AppError("Not found", 404);
    res.json({
      data: {
        _id: String(doc._id),
        name: doc.name,
        imageUrl: doc.imageUrl ?? null,
        meta: {
          code: doc.code ?? null,
          isActive: doc.isActive !== false,
          startDate: doc.startDate ?? null,
          endDate: doc.endDate ?? null,
          calculationType: doc.promotionType?.calculationType ?? null,
        },
      },
    });
    return;
  }
  if (sourceType === "banner") {
    const doc: any = await BannerContent.findById(id)
      .select("name image heading")
      .lean();
    if (!doc) throw new AppError("Not found", 404);
    res.json({
      data: {
        _id: String(doc._id),
        name: doc.name,
        imageUrl: doc.image || null,
        meta: { headline: doc.heading?.title ?? "" },
      },
    });
    return;
  }

  throw new ValidationError({ sourceType: ["Unsupported source type"] });
}

/* ----------------------- form parsing ----------------------------------- */

type Parsed =
  | { ok: true; doc: Record<string, any> }
  | { ok: false; error: string };

function parseDisplayConfig(body: any): Record<string, any> {
  const dc = body?.displayConfig ?? {};
  return {
    theme: pickEnum(dc.theme, BLOCK_THEMES, "inherit"),
    columns: clamp(readNum(dc.columns, 4), 1, 6),
    gap: clamp(readNum(dc.gap, 16), 0, 64),
    borderless: readBool(dc.borderless),
    rounded: readBool(dc.rounded, true),
    shadow: readBool(dc.shadow),
    alignment: pickEnum(dc.alignment, BLOCK_ALIGNMENTS, "start"),
    animation: pickEnum(dc.animation, BLOCK_ANIMATIONS, "fade"),
    cardShape: pickEnum(dc.cardShape, CARD_SHAPES, "default"),
    cardRatio: pickEnum(dc.cardRatio, CARD_RATIOS, "1:1"),
    cardSize: pickEnum(dc.cardSize, CARD_SIZES, "md"),
    cardLayout: pickEnum(dc.cardLayout, CARD_LAYOUTS, "stacked"),
    titlePosition: pickEnum(dc.titlePosition, TITLE_POSITIONS, "below"),
    imagePosition: pickEnum(dc.imagePosition, IMAGE_POSITIONS, "center"),
    backgroundColor: readColor(dc.backgroundColor),
    textColor: readColor(dc.textColor),
  };
}

function parseCta(body: any) {
  return {
    text: String(body?.cta?.text ?? "").trim(),
    link: String(body?.cta?.link ?? "").trim(),
    style: pickEnum(body?.cta?.style, CTA_STYLES, "none"),
  };
}

function parseBlockBody(body: any): Parsed {
  const name = String(body?.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required" };

  const location = pickEnum(
    body?.location,
    BLOCK_LOCATIONS,
    "Home" as BlockLocation,
  );
  const display = pickEnum(body?.display, BLOCK_DISPLAYS, "grid");
  const sourceType = pickEnum(
    body?.source?.type,
    BLOCK_SOURCE_TYPES,
    "collection",
  );

  const source: any = { type: sourceType };

  if (sourceType === "collection") {
    const id = String(body?.source?.collectionId ?? "");
    if (!mongoose.Types.ObjectId.isValid(id))
      return { ok: false, error: "Select a collection" };
    source.collectionId = new mongoose.Types.ObjectId(id);
  } else if (sourceType === "category") {
    const id = String(body?.source?.categoryId ?? "");
    if (!mongoose.Types.ObjectId.isValid(id))
      return { ok: false, error: "Select a category" };
    source.categoryId = new mongoose.Types.ObjectId(id);
  } else if (sourceType === "promotion") {
    const id = String(body?.source?.promotionId ?? "");
    if (!mongoose.Types.ObjectId.isValid(id))
      return { ok: false, error: "Select a promotion" };
    source.promotionId = new mongoose.Types.ObjectId(id);
    source.promotionMode = pickEnum(
      body?.source?.promotionMode,
      PROMOTION_MODES,
      "products",
    );
  } else if (sourceType === "banner") {
    const ids = readIdArray(body?.source?.bannerIds, MAX_BANNERS_PER_BLOCK);
    if (ids.length === 0)
      return { ok: false, error: "Select at least one banner" };
    source.bannerIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  } else if (sourceType === "manual") {
    const raw = Array.isArray(body?.source?.items) ? body.source.items : [];
    const items = raw
      .filter(
        (i: any) =>
          i &&
          typeof i.refModel === "string" &&
          (BLOCK_REF_MODELS as readonly string[]).includes(i.refModel) &&
          i.refId &&
          mongoose.Types.ObjectId.isValid(i.refId),
      )
      .slice(0, 50)
      .map((i: any) => ({
        refModel: i.refModel,
        refId: new mongoose.Types.ObjectId(i.refId),
      }));
    if (items.length === 0)
      return { ok: false, error: "Add at least one item for a manual block" };
    source.items = items;
  }

  const heading =
    sourceType === "banner"
      ? { title: "", subtitle: "", showHeading: false }
      : {
          title: String(body?.heading?.title ?? "").trim(),
          subtitle: String(body?.heading?.subtitle ?? "").trim(),
          showHeading: readBool(body?.heading?.showHeading, true),
        };

  const cta =
    sourceType === "banner"
      ? { text: "", link: "", style: "none" as const }
      : parseCta(body);
  if (cta.style !== "none" && !cta.link)
    return { ok: false, error: "CTA requires a link" };

  const doc = {
    name,
    location,
    display,
    source,
    heading,
    displayConfig: parseDisplayConfig(body),
    sourceStyles: {
      promotionBadgeStyle: String(
        body?.sourceStyles?.promotionBadgeStyle ?? "default",
      ),
      promotionShowCode: readBool(body?.sourceStyles?.promotionShowCode, true),
      collectionShowItemCount: readBool(
        body?.sourceStyles?.collectionShowItemCount,
      ),
      collectionCountPosition: String(
        body?.sourceStyles?.collectionCountPosition ?? "subline",
      ),
      manualCardSize: String(body?.sourceStyles?.manualCardSize ?? "md"),
      manualCardVariant: String(
        body?.sourceStyles?.manualCardVariant ?? "card",
      ),
      manualShowDescription: readBool(
        body?.sourceStyles?.manualShowDescription,
        true,
      ),
    },
    cta,
    limit: clamp(readNum(body?.limit, 12), 1, MAX_BLOCK_LIMIT),
    status: pickEnum(body?.status, ["active", "inactive"] as const, "active"),
    order: Math.max(0, readNum(body?.order, 0)),
  };

  return { ok: true, doc };
}

/* ------------------------------ reads ----------------------------------- */

export async function getAllBlocks(req: Request, res: Response): Promise<void> {
  await connection();
  const location = req.query.location as BlockLocation | undefined;
  const filter: Record<string, any> = {};
  if (location) filter.location = location;
  const docs = await Block.find(filter)
    .sort({ location: 1, order: 1, created_at: -1 })
    .lean();
  res.json({ data: JSON.parse(JSON.stringify(docs)) });
}

export async function getBlockById(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid block ID"] });
  await connection();
  const doc = await Block.findById(id).lean();
  if (!doc) throw new AppError("Block not found", 404);
  res.json({ data: JSON.parse(JSON.stringify(doc)) });
}

/* ---------------------------- mutations --------------------------------- */

async function countMissingBanners(ids: any[]): Promise<number> {
  if (!ids.length) return 0;
  const found = await BannerContent.countDocuments({ _id: { $in: ids } });
  return ids.length - found;
}

export async function createBlock(req: Request, res: Response): Promise<void> {
  const parsed = parseBlockBody(req.body ?? {});
  if (!parsed.ok) throw new ValidationError({ _form: [parsed.error] });
  await connection();

  if (parsed.doc.source.type === "banner") {
    const missing = await countMissingBanners(parsed.doc.source.bannerIds);
    if (missing > 0)
      throw new AppError(
        `${missing} of the selected banners were deleted.`,
        409,
      );
  }

  const doc = new Block(parsed.doc);
  await doc.save();
  res
    .status(201)
    .json({ success: true, data: JSON.parse(JSON.stringify(doc.toObject())) });
}

export async function updateBlock(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid block ID"] });
  const parsed = parseBlockBody(req.body ?? {});
  if (!parsed.ok) throw new ValidationError({ _form: [parsed.error] });
  await connection();

  if (parsed.doc.source.type === "banner") {
    const missing = await countMissingBanners(parsed.doc.source.bannerIds);
    if (missing > 0)
      throw new AppError(
        `${missing} of the selected banners were deleted.`,
        409,
      );
  }

  const updated = await Block.findByIdAndUpdate(id, parsed.doc, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new AppError("Block not found", 404);
  res.json({
    success: true,
    data: JSON.parse(JSON.stringify(updated.toObject())),
  });
}

export async function deleteBlock(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid block ID"] });
  await connection();
  const deleted = await Block.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Block not found", 404);
  res.json({ success: true });
}

export async function reorderBlocks(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const { location, orderedIds } = req.body ?? {};

  if (!(BLOCK_LOCATIONS as readonly string[]).includes(location)) {
    throw new ValidationError({ location: ["Invalid location"] });
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new ValidationError({ orderedIds: ["No ids provided"] });
  }
  if (
    !orderedIds.every(
      (id: any) =>
        typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
    )
  ) {
    throw new ValidationError({ orderedIds: ["Invalid ids"] });
  }

  await Block.bulkWrite(
    orderedIds.map((id: string, i: number) => ({
      updateOne: { filter: { _id: id, location }, update: { order: i } },
    })),
  );
  res.json({ success: true });
}
