import type { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Product from "../models/Product.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function userId(req: Request): string {
  const user = (req as Request & { user?: { id?: string } }).user;
  if (!user?.id) throw new AppError("Authentication required", 401);
  return user.id;
}

function productId(req: Request): string {
  const raw = req.params.productId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ productId: ["Invalid product ID"] });
  }
  return id;
}

export async function getWishlist(req: Request, res: Response): Promise<void> {
  await connection();
  const user = await User.findById(userId(req))
    .select("wishlist")
    .populate("wishlist.product", "name price listPrice images slug status")
    .lean();
  res.json({ data: user?.wishlist ?? [] });
}

export async function addToWishlist(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const uid = userId(req);
  const pid = productId(req);

  const product = await Product.findById(pid).select("_id price status");
  if (!product) throw new AppError("Product not found", 404);

  const user = await User.findById(uid).select("wishlist");
  if (!user) throw new AppError("User not found", 404);

  const exists = user.wishlist?.some(
    (item: any) => String(item.product) === pid,
  );
  if (!exists) {
    user.wishlist.push({ product: new mongoose.Types.ObjectId(pid) } as any);
    await user.save();
    await Product.updateOne(
      { _id: pid },
      { $inc: { "stats.wishlistCount": 1 } },
    );
  }

  res.json({ success: true, wishlisted: true });
}

export async function removeFromWishlist(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const uid = userId(req);
  const pid = productId(req);

  const user = await User.findById(uid).select("wishlist");
  if (!user) throw new AppError("User not found", 404);

  const before = user.wishlist?.length ?? 0;
  user.wishlist = (user.wishlist ?? []).filter(
    (item: any) => String(item.product) !== pid,
  );
  if (user.wishlist.length !== before) {
    await user.save();
    await Product.updateOne(
      { _id: pid, "stats.wishlistCount": { $gt: 0 } },
      { $inc: { "stats.wishlistCount": -1 } },
    );
  }

  res.json({ success: true, wishlisted: false });
}

export async function isWishlisted(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const uid = userId(req);
  const pid = productId(req);
  const user = await User.findById(uid).select("wishlist").lean();
  const wishlisted = (user?.wishlist ?? []).some(
    (item: any) => String(item.product) === pid,
  );
  res.json({ data: { wishlisted } });
}
