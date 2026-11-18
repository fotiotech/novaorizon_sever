import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Review } from "../models/Review.js";
import "../models/Product.js";
import "../models/User.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import Product from "../models/Product.js";
import { consumeRateLimit } from "../utils/rate-limit.js";

/** Admin review moderation. */

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function listReviews(req: Request, res: Response): Promise<void> {
  await connection();

  const { page = "1", limit = "10", rating, status } = req.query as Record<
    string,
    string | undefined
  >;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const query: Record<string, any> = {};
  if (rating) query.rating = Number(rating);
  if (status) query.status = status;

  const [total, reviews] = await Promise.all([
    Review.countDocuments(query),
    Review.find(query)
      .populate("userId", "email firstName lastName name")
      .populate("productId", "name")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
  ]);

  res.json({
    data: {
      reviews: JSON.parse(JSON.stringify(reviews)).map((r: any) => ({
        ...r,
        userId: r.userId?._id ?? r.userId,
        productId: r.productId?._id ?? r.productId,
      })),
      total,
      pages: Math.ceil(total / limitNum) || 0,
      currentPage: pageNum,
    },
  });
}

export async function deleteReview(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid review id"] });
  }
  await connection();

  const deleted = await Review.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Review not found", 404);
  res.json({ success: true });
}
/* --------------------------- customer: create --------------------------- */

/**
 * POST /api/reviews/products/:id — signed-in customer adds or edits their
 * review. Reviews are embedded on the product (`reviewsRatings`), one row
 * per user.
 */
export async function upsertProductReview(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const productId = param(req, "id");

  const limit = consumeRateLimit(`review:${userId}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    throw new AppError("Too many reviews. Please try again later.", 429);
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ValidationError({ productId: ["Invalid product id"] });
  }

  const rating = Number(req.body?.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new ValidationError({ rating: ["Rating must be between 1 and 5"] });
  }
  const comment = String(req.body?.comment ?? "")
    .trim()
    .slice(0, 1000);

  await connection();

  const product: any = await Product.findById(productId);
  if (!product) throw new AppError("Product not found", 404);

  const rows: any[] = Array.isArray(product.reviewsRatings)
    ? product.reviewsRatings
    : [];

  const existing = rows.find((r) => String(r.user) === String(userId));
  if (existing) {
    existing.rating = rating;
    existing.comment = comment;
    existing.updatedAt = new Date();
  } else {
    rows.push({
      user: new mongoose.Types.ObjectId(userId),
      rating,
      comment,
    });
  }

  product.reviewsRatings = rows;
  await product.save();

  res.json({ success: true });
}
/* ------------------------- customer: my reviews ------------------------- */

/**
 * GET /api/reviews/mine — the signed-in customer's reviews. Reviews are
 * embedded on the product document (`reviewsRatings`).
 */
export async function listMyReviews(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 8));
  const skip = (page - 1) * limit;

  await connection();

  const filter = { "reviewsRatings.user": new mongoose.Types.ObjectId(userId) };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select("name mainImage images reviewsRatings")
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  const reviews = (products as any[]).flatMap((product) => {
    const rows = (product.reviewsRatings ?? []).filter(
      (r: any) => String(r.user) === String(userId),
    );

    return rows.map((r: any, index: number) => ({
      _id: `${product._id}-${index}`,
      productId: {
        _id: String(product._id),
        name: product.name,
        mainImage:
          product.mainImage ??
          (Array.isArray(product.images) ? product.images[0] : undefined),
      },
      rating: Number(r.rating) || 0,
      reviewText: r.comment ?? "",
      helpfulCount: 0,
      mediaUrl: [],
      createdAt: r.updatedAt ?? r.createdAt ?? null,
    }));
  });

  res.json({
    data: {
      reviews,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      currentPage: page,
    },
  });
}

/** DELETE /api/reviews/mine/:productId — remove the caller's review. */
export async function deleteMyReview(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const productId = param(req, "productId");

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ValidationError({ productId: ["Invalid product id"] });
  }

  await connection();

  const product: any = await Product.findById(productId);
  if (!product) throw new AppError("Product not found", 404);

  const before = (product.reviewsRatings ?? []).length;
  product.reviewsRatings = (product.reviewsRatings ?? []).filter(
    (r: any) => String(r.user) !== String(userId),
  );

  if (product.reviewsRatings.length === before) {
    throw new AppError("Review not found", 404);
  }

  await product.save();
  res.json({ success: true });
}
