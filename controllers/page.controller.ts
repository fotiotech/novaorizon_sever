import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import Page from "../models/Page.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

const PageValidationSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  slug: z.string().min(1).max(100).optional(),
  excerpt: z.string().max(300).optional().default(""),
  content: z.string().optional().default(""),
  // Fixed: "" is a valid empty value, not a URL.
  featuredImage: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .default(""),
  metaTitle: z.string().max(60).optional().default(""),
  metaDescription: z.string().max(160).optional().default(""),
  metaKeywords: z.array(z.string()).optional().default([]),
  status: z.enum(["draft", "review", "published", "archived"]).default("draft"),
  publishedAt: z.string().datetime().nullable().optional(),
  author: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  category: z.string().optional().default(""),
  isFeatured: z.boolean().default(false),
});

function preprocess(raw: any) {
  const out = { ...raw };
  if (out.publishedAt === "") out.publishedAt = null;
  if (out.author === "") out.author = null;
  return out;
}

function serializePage(doc: any) {
  if (!doc) return null;
  return {
    ...doc,
    _id: doc._id.toString(),
    publishedAt: doc.publishedAt
      ? new Date(doc.publishedAt).toISOString()
      : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

/* ------------------------------- CREATE --------------------------------- */

export async function createPage(req: Request, res: Response): Promise<void> {
  await connection();

  const parsed = PageValidationSchema.safeParse(preprocess(req.body ?? {}));
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors as any);
  }
  const data = parsed.data;

  if (data.slug) {
    const existing = await Page.findOne({ slug: data.slug }).lean();
    if (existing) {
      throw new ValidationError({ slug: ["Slug already exists"] });
    }
  }

  const pageData: any = { ...data };
  if (pageData.publishedAt)
    pageData.publishedAt = new Date(pageData.publishedAt);
  else delete pageData.publishedAt;

  const page = new Page(pageData);
  await page.save();

  res.status(201).json({ success: true, data: serializePage(page.toObject()) });
}

/* ------------------------------- UPDATE --------------------------------- */

export async function updatePage(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid page ID"] });
  }
  await connection();

  const parsed = PageValidationSchema.safeParse(preprocess(req.body ?? {}));
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors as any);
  }
  const data = parsed.data;

  if (data.slug) {
    const existing = await Page.findOne({
      slug: data.slug,
      _id: { $ne: id },
    }).lean();
    if (existing) {
      throw new ValidationError({ slug: ["Slug already exists"] });
    }
  }

  const updateData: any = { ...data };

  // FIXED: only touch publishedAt when the caller explicitly provided it.
  // The original forced `null` on every update, un-publishing live pages.
  if (data.publishedAt !== undefined) {
    updateData.publishedAt = data.publishedAt
      ? new Date(data.publishedAt)
      : null;
  } else {
    delete updateData.publishedAt;
  }

  const updated = await Page.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).lean();
  if (!updated) throw new AppError("Page not found", 404);

  res.json({ success: true, data: serializePage(updated) });
}

/* ------------------------------- DELETE --------------------------------- */

export async function deletePage(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid page ID"] });
  }
  await connection();

  const deleted = await Page.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Page not found", 404);
  res.json({ success: true });
}

/* --------------------------------- LIST --------------------------------- */

export async function getPages(_req: Request, res: Response): Promise<void> {
  await connection();
  const pages = await Page.find({}).sort({ createdAt: -1 }).lean();
  res.json({ data: pages.map(serializePage) });
}

export async function getPageById(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid page ID"] });
  }
  await connection();
  const page = await Page.findById(id).lean();
  if (!page) throw new AppError("Page not found", 404);
  res.json({ data: serializePage(page) });
}

/**
 * Public endpoint: fetch a page by slug. Only returns published pages.
 * Used by the storefront to render `/pages/:slug`.
 */
export async function getPageBySlug(
  req: Request,
  res: Response,
): Promise<void> {
  const slug = param(req, "slug");
  await connection();
  const page = await Page.findOne({ slug, status: "published" }).lean();
  if (!page) throw new AppError("Page not found", 404);
  res.json({ data: serializePage(page) });
}
