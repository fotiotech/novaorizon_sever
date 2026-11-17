import type { Request, Response } from "express";
import mongoose from "mongoose";
import slugify from "slugify";
import Brand from "../models/Brand.js";
import Product from "../models/Product.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function generateSlug(name: string): string {
  // Fixed vs. original: the original concatenated the logo URL into the
  // slug, producing "nike-https-example-com-logo-png". Use just the name.
  return slugify(name, { lower: true, strict: true });
}

/* ------------------------------- list ----------------------------------- */

export async function getBrands(req: Request, res: Response): Promise<void> {
  await connection();
  const id = req.query.id as string | undefined;

  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError({ id: ["Invalid brand ID"] });
    }
    const brand = await Brand.findById(id);
    if (!brand) throw new AppError("Brand not found", 404);
    res.json({ data: brand.toJSON() });
    return;
  }

  const brands = await Brand.find().sort({ createdAt: -1 }).lean();
  res.json({
    data: brands.map((b: any) => ({
      ...b,
      _id: b._id.toString(),
    })),
  });
}

/* ------------------------- products by brand ---------------------------- */

export async function findProductsByBrand(
  req: Request,
  res: Response,
): Promise<void> {
  const brandId = param(req, "brandId");
  await connection();

  if (!mongoose.Types.ObjectId.isValid(brandId)) {
    throw new ValidationError({ brandId: ["Invalid brand ID"] });
  }

  const products = await Product.find({ brand: brandId });
  res.json({
    data: products.map((product: any) => {
      const obj = product.toObject();
      return {
        ...obj,
        _id: obj._id?.toString(),
        categoryId: obj.categoryId?.toString(),
        category_id: obj.categoryId?.toString(),
        brand: obj.brand?.toString(),
        // `attributes` is not on the Product schema today — guard for safety.
        attributes: Array.isArray(obj.attributes)
          ? obj.attributes.map((attr: any) => ({
              ...(attr.toObject ? attr.toObject() : attr),
              _id: attr._id?.toString(),
            }))
          : undefined,
      };
    }),
  });
}

/* ------------------------------ create ---------------------------------- */

export async function createBrand(req: Request, res: Response): Promise<void> {
  await connection();
  const { name, logoUrl, status } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    throw new ValidationError({ name: ["Brand name is required"] });
  }

  const trimmed = name.trim();
  const url_slug = generateSlug(trimmed);

  const newBrand = new Brand({
    url_slug,
    name: trimmed,
    logoUrl: logoUrl ?? null,
    status: status === "inactive" ? "inactive" : "active",
  });

  await newBrand.save();

  // Fixed vs. original: return the created brand so callers can use its _id.
  res.status(201).json({ success: true, data: newBrand.toJSON() });
}

/* ------------------------------ update ---------------------------------- */

export async function updateBrand(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid brand ID"] });
  }
  await connection();

  const { name, logoUrl, status } = req.body ?? {};
  const update: Record<string, any> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      throw new ValidationError({ name: ["Brand name cannot be empty"] });
    }
    update.name = name.trim();
    update.url_slug = generateSlug(name.trim());
  }
  if (logoUrl !== undefined) update.logoUrl = logoUrl;
  if (status !== undefined) update.status = status;

  const updated = await Brand.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true },
  );
  if (!updated) throw new AppError("Brand not found", 404);

  res.json({ success: true, data: updated.toJSON() });
}

/* ------------------------------ delete ---------------------------------- */

export async function deleteBrand(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid brand ID"] });
  }
  await connection();

  await Product.updateMany({ brand: id }, { $unset: { brand: "" } });
  const deleted = await Brand.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Brand not found", 404);

  res.json({ success: true, message: "Brand deleted successfully" });
}
