import type { Request, Response } from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import "../models/Brand.js";
import "../models/Category.js";
import "../models/Attribute.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

/**
 * Public, read-only catalogue surface for the storefront.
 *
 * The admin API under /api/products is admin-gated; the storefront only ever
 * needs published products with public fields, so it gets its own small
 * controller instead of reusing the admin handlers.
 */

const HIDDEN_STATUSES: Array<"draft" | "inactive"> = ["draft", "inactive"];

const LIST_FIELDS =
  "name slug sku images price listPrice quantity brand categoryId tags status createdAt updatedAt";

function asString(value: unknown): string {
  return Array.isArray(value) ? String(value[0]) : String(value ?? "");
}

function validObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

/* ------------------------------ list ------------------------------------- */

export async function listPublicProducts(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(req.query.pageSize) || 24),
  );
  const skip = (page - 1) * pageSize;

  const filter: Record<string, any> = {
    status: { $nin: HIDDEN_STATUSES },
  };

  const categoryId = asString(req.query.categoryId);
  if (categoryId && validObjectId(categoryId)) {
    filter.categoryId = new mongoose.Types.ObjectId(categoryId);
  }

  const brand = asString(req.query.brand);
  if (brand && validObjectId(brand)) {
    filter.brand = new mongoose.Types.ObjectId(brand);
  }

  const q = asString(req.query.q).trim();
  if (q) filter.name = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  const sortField = asString(req.query.sort) || "createdAt";
  const sortDir: 1 | -1 = req.query.sortDir === "asc" ? 1 : -1;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select(LIST_FIELDS)
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Product.countDocuments(filter),
  ]);

  res.json({
    data: {
      products: JSON.parse(JSON.stringify(products)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

/* ------------------------------ detail ----------------------------------- */

export async function getPublicProduct(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const id = asString(req.params.id);
  if (!id) throw new ValidationError({ id: ["Product id required"] });

  const query = validObjectId(id)
    ? { _id: new mongoose.Types.ObjectId(id) }
    : { slug: id };

  const product: any = await Product.findOne(query)
    .populate("brand", "name url_slug logoUrl")
    .populate("categoryId", "name slug")
    .lean();

  if (!product || HIDDEN_STATUSES.includes(product.status as any)) {
    throw new AppError("Product not found", 404);
  }

  const plain: any = JSON.parse(JSON.stringify(product));
  // The storefront reads `product.category` for breadcrumbs; expose the
  // populated category under both names.
  if (plain.categoryId && typeof plain.categoryId === "object") {
    plain.category = plain.categoryId;
  }

  res.json({ data: plain });
}

/* ----------------------------- related ----------------------------------- */

export async function listRelatedProducts(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const id = asString(req.params.id);
  if (!id || !validObjectId(id)) {
    throw new ValidationError({ id: ["Invalid product id"] });
  }

  const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 8));

  const product: any = await Product.findById(id)
    .select("categoryId brand")
    .lean();
  if (!product) throw new AppError("Product not found", 404);

  const or: Record<string, any>[] = [];
  if (product.categoryId) or.push({ categoryId: product.categoryId });
  if (product.brand) or.push({ brand: product.brand });

  const relatedFilter: Record<string, any> = {
    _id: { $ne: product._id },
    status: { $nin: HIDDEN_STATUSES },
  };
  if (or.length > 0) relatedFilter.$or = or;

  const related = await Product.find(relatedFilter as any)
    .select(LIST_FIELDS)
    .limit(limit)
    .lean();

  res.json({ data: JSON.parse(JSON.stringify(related)) });
}
