import type { Request, Response } from "express";
import mongoose from "mongoose";
import Promotion from "../models/Promotion.js";
import PromotionUsage from "../models/PromotionUsage.js";
import CustomerGroup from "../models/CustomerGroup.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { CALC_FIELDS } from "../config/calc-fields.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function isValidId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

function buildPropertySnapshot(calculationType: string) {
  const defs = CALC_FIELDS[calculationType] ?? [];
  return defs.map((d, i) => ({
    code: d.code,
    name: d.name,
    type: d.type,
    isRequired: d.isRequired ?? false,
    options: d.options ?? [],
    defaultValue: d.defaultValue,
    validation: d.validation,
    sortOrder: i,
  }));
}

function normalizeScope(scope: any) {
  const appliesTo = scope?.appliesTo ?? "all";
  return {
    appliesTo,
    productIds: appliesTo === "products" ? (scope?.productIds ?? []) : [],
    categoryIds: appliesTo === "categories" ? (scope?.categoryIds ?? []) : [],
    brandIds: appliesTo === "brands" ? (scope?.brandIds ?? []) : [],
    excludeProductIds: scope?.excludeProductIds ?? [],
  };
}

/* -------------------------- composer options ---------------------------- */

export async function getPromotionOptions(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const [customerGroups, promotions, products, categories, brands] =
    await Promise.all([
      CustomerGroup.find().lean(),
      Promotion.find().select("name _id").sort({ createdAt: -1 }).lean(),
      Product.find()
        .select("name _id sku price images")
        .sort({ createdAt: -1 })
        .lean(),
      Category.find().select("name _id slug").sort({ name: 1 }).lean(),
      Brand.find().select("name _id url_slug").sort({ name: 1 }).lean(),
    ]);

  res.json({
    data: {
      customerGroups: customerGroups.map((g: any) => ({
        label: g.name,
        value: g._id.toString(),
      })),
      promotions: promotions.map((p: any) => ({
        label: p.name,
        value: p._id.toString(),
      })),
      products: products.map((p: any) => ({
        value: p._id.toString(),
        label: p.name,
        sku: p.sku ?? undefined,
        price: typeof p.price === "number" ? p.price : undefined,
        // FIXED: original read p.image (singular), but Product has images[].
        image: Array.isArray(p.images) ? (p.images[0] ?? undefined) : undefined,
      })),
      categories: categories.map((c: any) => ({
        value: c._id.toString(),
        label: c.name,
        sublabel: c.slug ?? undefined,
      })),
      brands: brands.map((b: any) => ({
        value: b._id.toString(),
        label: b.name,
        sublabel: b.url_slug ?? undefined,
      })),
    },
  });
}

/* -------------------------------- CRUD ---------------------------------- */

export async function createPromotion(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const data = req.body ?? {};

  if (!data.calculationType) {
    throw new ValidationError({
      calculationType: ["Calculation type is required"],
    });
  }

  const promotionType = {
    name: data.name,
    code: data.code || undefined,
    description: data.description,
    calculationType: data.calculationType,
    properties: buildPropertySnapshot(data.calculationType),
    isActive: true,
  };

  const payload = {
    name: data.name,
    description: data.description,
    imageUrl: data.imageUrl || undefined,
    code: data.code?.trim().toUpperCase() || undefined,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    isActive: data.isActive ?? true,
    priority: data.priority ?? 0,
    promotionType,
    scope: normalizeScope(data.scope),
    propertyValues: new Map(
      Object.entries(data.propertyValues ?? {}).filter(
        ([, v]) => v !== undefined && v !== null && v !== "",
      ),
    ),
    customerEligibility: {
      allCustomers: data.customerEligibility?.allCustomers ?? true,
      customerGroupIds: data.customerEligibility?.customerGroupIds ?? [],
      minOrderAmount: data.customerEligibility?.minOrderAmount ?? 0,
    },
    usageLimits: {
      totalUses: data.usageLimits?.totalUses ?? null,
      perCustomer: data.usageLimits?.perCustomer ?? null,
      perOrder: data.usageLimits?.perOrder ?? 1,
    },
    stackable: data.stackable ?? false,
    exclusiveWith: data.exclusiveWith ?? [],
  };

  try {
    const promotion = await Promotion.create(payload);
    res.status(201).json({ success: true, data: promotion.toObject() });
  } catch (err: any) {
    if (err.code === 11000) {
      throw new AppError("A promotion with this code already exists", 409);
    }
    throw new AppError(`Failed to create promotion: ${err.message}`, 500);
  }
}

export async function updatePromotion(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!isValidId(id))
    throw new ValidationError({ id: ["Invalid promotion ID"] });
  await connection();

  const data = req.body ?? {};
  const existing: any = await Promotion.findById(id).lean();
  if (!existing) throw new AppError("Promotion not found", 404);

  const calculationType =
    data.calculationType ?? existing.promotionType?.calculationType;
  const typeChanged =
    data.calculationType &&
    data.calculationType !== existing.promotionType?.calculationType;

  const promotionType = typeChanged
    ? {
        name: data.name ?? existing.name,
        code: data.code ?? existing.code,
        description: data.description ?? existing.promotionType?.description,
        calculationType,
        properties: buildPropertySnapshot(calculationType),
        isActive: true,
      }
    : {
        ...existing.promotionType,
        name: data.name ?? existing.promotionType?.name,
      };

  const update: any = {
    name: data.name ?? existing.name,
    description: data.description ?? existing.description,
    startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
    endDate: data.endDate ? new Date(data.endDate) : existing.endDate,
    isActive: data.isActive ?? existing.isActive,
    priority: data.priority ?? existing.priority,
    promotionType,
    customerEligibility:
      data.customerEligibility ?? existing.customerEligibility,
    usageLimits: data.usageLimits ?? existing.usageLimits,
    stackable: data.stackable ?? existing.stackable,
    exclusiveWith: data.exclusiveWith ?? existing.exclusiveWith,
  };

  if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl || "";
  if (data.scope !== undefined) update.scope = normalizeScope(data.scope);
  if (data.code !== undefined)
    update.code = data.code ? data.code.trim().toUpperCase() : null;
  if (data.propertyValues !== undefined) {
    update.propertyValues = new Map(
      Object.entries(data.propertyValues).filter(
        ([, v]) => v !== undefined && v !== null && v !== "",
      ),
    );
  }

  try {
    const updated = await Promotion.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true },
    ).lean();
    if (!updated) throw new AppError("Promotion not found", 404);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err.code === 11000) {
      throw new AppError("A promotion with this code already exists", 409);
    }
    throw err;
  }
}

export async function deletePromotion(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!isValidId(id))
    throw new ValidationError({ id: ["Invalid promotion ID"] });
  await connection();

  const usageCount = await PromotionUsage.countDocuments({ promotionId: id });
  if (usageCount > 0) {
    throw new AppError(
      `Cannot delete: this promotion has been redeemed ${usageCount} time(s). Deactivate it instead.`,
      409,
    );
  }

  const result = await Promotion.findByIdAndDelete(id).lean();
  if (!result) throw new AppError("Promotion not found", 404);
  res.json({ success: true });
}

export async function getPromotion(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!isValidId(id))
    throw new ValidationError({ id: ["Invalid promotion ID"] });
  await connection();

  const promotion = await Promotion.findById(id)
    .populate("customerEligibility.customerGroupIds")
    .populate("exclusiveWith")
    .populate("scope.productIds")
    .populate("scope.categoryIds")
    .populate("scope.brandIds")
    .populate("scope.excludeProductIds")
    .lean();

  if (!promotion) throw new AppError("Promotion not found", 404);
  res.json({ data: promotion });
}

export async function listPromotions(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const [data, total] = await Promise.all([
    Promotion.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Promotion.countDocuments(),
  ]);

  res.json({ data: { data, total, limit, skip } });
}

/* ----------------------- product-side scope sync ------------------------ */

export async function getSelectablePromotions(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const promotions = await Promotion.find({ "scope.appliesTo": "products" })
    .select("name code isActive promotionType.calculationType")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    data: promotions.map((p: any) => ({
      value: p._id.toString(),
      label: p.name,
      sublabel: p.code ?? undefined,
      badge: p.promotionType?.calculationType ?? undefined,
      inactive: p.isActive === false,
    })),
  });
}

export async function getProductPromotions(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "productId");
  await connection();
  if (!isValidId(productId)) {
    res.json({ data: [] });
    return;
  }

  const promotions = await Promotion.find({
    "scope.appliesTo": "products",
    "scope.productIds": productId,
  })
    .select("_id")
    .lean();

  res.json({ data: promotions.map((p: any) => p._id.toString()) });
}

export async function syncProductPromotions(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "productId");
  await connection();
  if (!isValidId(productId))
    throw new ValidationError({ productId: ["Invalid product ID"] });

  const promotionIds = Array.isArray(req.body?.promotionIds)
    ? req.body.promotionIds
    : [];
  const validIds = promotionIds.filter(
    (id: any) => typeof id === "string" && isValidId(id),
  );

  await Promotion.updateMany(
    {
      "scope.appliesTo": "products",
      "scope.productIds": productId,
      _id: { $nin: validIds },
    },
    { $pull: { "scope.productIds": productId } },
  );

  if (validIds.length > 0) {
    await Promotion.updateMany(
      {
        _id: { $in: validIds },
        "scope.appliesTo": "products",
        "scope.productIds": { $ne: productId },
      },
      { $addToSet: { "scope.productIds": productId } },
    );
  }

  res.json({ success: true });
}
