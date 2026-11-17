import type { Request, Response } from "express";
import mongoose from "mongoose";
import MetaTagUrl from "../models/MetaTagUrl.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function toObjectIdOrThrow(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid meta tag ID"] });
  }
  return new mongoose.Types.ObjectId(id);
}

function keywordsToArray(input: unknown): string[] | undefined {
  if (input === undefined) return undefined;
  if (Array.isArray(input))
    return input.filter((k): k is string => typeof k === "string");
  if (typeof input === "string") {
    return input
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  return [];
}

/* -------------------------------- LIST ---------------------------------- */

export async function getMetaTags(req: Request, res: Response): Promise<void> {
  await connection();

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const search = String(req.query.search ?? "").trim();
  const skip = (page - 1) * limit;

  const filter = search
    ? {
        $or: [
          { url: { $regex: search, $options: "i" } },
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  const [metaTags, total] = await Promise.all([
    MetaTagUrl.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MetaTagUrl.countDocuments(filter),
  ]);

  res.json({
    data: {
      data: JSON.parse(JSON.stringify(metaTags)),
      total,
      page,
      limit,
    },
  });
}

/* ------------------------------ GET by ID ------------------------------- */

export async function getMetaTagById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);
  await connection();

  const doc = await MetaTagUrl.findById(id).lean();
  if (!doc) throw new AppError("Meta tag not found", 404);
  res.json({ data: JSON.parse(JSON.stringify(doc)) });
}

/* ------------------------ PUBLIC: GET by URL ---------------------------- */
/* Used by the storefront to render <head> tags for the current route.      */

export async function getMetaTagByUrl(
  req: Request,
  res: Response,
): Promise<void> {
  const url = String(req.query.url ?? "").trim();
  if (!url) throw new ValidationError({ url: ["URL is required"] });
  await connection();

  // 1. Exact match
  let doc = await MetaTagUrl.findOne({ url, isActive: true }).lean();

  // 2. Pattern match fallback
  if (!doc) {
    const patterns = await MetaTagUrl.find({
      urlPattern: { $exists: true, $ne: "" },
      isActive: true,
    }).lean();

    doc =
      patterns.find((tag: any) => {
        if (!tag.urlPattern) return false;
        try {
          return new RegExp(tag.urlPattern).test(url);
        } catch {
          return false;
        }
      }) || null;
  }

  if (!doc) throw new AppError("No meta tags for this URL", 404);
  res.json({ data: JSON.parse(JSON.stringify(doc)) });
}

/* ------------------------------- CREATE --------------------------------- */

export async function createMetaTag(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const body = req.body ?? {};

  if (!body.url || !body.title || !body.description) {
    throw new ValidationError({
      url: body.url ? undefined : ["URL is required"],
      title: body.title ? undefined : ["Title is required"],
      description: body.description ? undefined : ["Description is required"],
    });
  }

  const existing = await MetaTagUrl.findOne({ url: body.url }).lean();
  if (existing) throw new AppError("Meta tag for this URL already exists", 409);

  const keywords = keywordsToArray(body.keywords) ?? [];

  const created = await MetaTagUrl.create({
    ...body,
    keywords,
    createdBy: "admin",
    lastModified: new Date(),
  });

  res
    .status(201)
    .json({ success: true, data: JSON.parse(JSON.stringify(created)) });
}

/* ------------------------------- UPDATE --------------------------------- */

export async function updateMetaTag(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);
  await connection();

  const body = req.body ?? {};
  if (!body.url || !body.title || !body.description) {
    throw new ValidationError({
      _form: ["URL, title, and description are required"],
    });
  }

  const existing = await MetaTagUrl.findById(id);
  if (!existing) throw new AppError("Meta tag not found", 404);

  if (body.url !== existing.url) {
    const conflict = await MetaTagUrl.findOne({
      url: body.url,
      _id: { $ne: id },
    }).lean();
    if (conflict) {
      throw new AppError("Another meta tag already exists for this URL", 409);
    }
  }

  const keywords = keywordsToArray(body.keywords) ?? [];

  const updated = await MetaTagUrl.findByIdAndUpdate(
    id,
    { ...body, keywords, lastModified: new Date() },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw new AppError("Meta tag not found", 404);

  res.json({ success: true, data: JSON.parse(JSON.stringify(updated)) });
}

/* ------------------------------- DELETE --------------------------------- */

export async function deleteMetaTag(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);
  await connection();

  const deleted = await MetaTagUrl.findByIdAndDelete(id).lean();
  if (!deleted) throw new AppError("Meta tag not found", 404);

  res.json({ success: true, data: JSON.parse(JSON.stringify(deleted)) });
}

/* ------------------------------ TOGGLE ---------------------------------- */

export async function toggleMetaTagStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);
  await connection();

  const doc = await MetaTagUrl.findById(id);
  if (!doc) throw new AppError("Meta tag not found", 404);

  doc.isActive = !doc.isActive;
  doc.lastModified = new Date();
  await doc.save();

  res.json({ success: true, data: JSON.parse(JSON.stringify(doc)) });
}

/* ---------------------------- BULK UPDATE ------------------------------- */

export async function bulkUpdateMetaTags(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const { ids, updates } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError({ ids: ["No meta tag IDs provided"] });
  }
  if (!updates || typeof updates !== "object") {
    throw new ValidationError({ updates: ["Updates object required"] });
  }

  const updateData: Record<string, any> = { lastModified: new Date() };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (key === "keywords") {
      updateData.keywords = keywordsToArray(value) ?? [];
    } else {
      updateData[key] = value;
    }
  }

  const result = await MetaTagUrl.updateMany({ _id: { $in: ids } }, updateData);
  res.json({ success: true, data: { updatedCount: result.modifiedCount } });
}

/* -------------------------- SITEMAP FEED -------------------------------- */

export async function getMetaTagsForSitemap(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const docs = await MetaTagUrl.find({ isActive: true })
    .select("url lastModified priority changeFrequency")
    .lean();
  res.json({ data: JSON.parse(JSON.stringify(docs)) });
}
