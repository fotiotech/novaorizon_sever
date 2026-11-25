import type { Request, Response } from "express";
import mongoose from "mongoose";
import Promotion from "../models/Promotion.js";
import Offer from "../models/Offer.js";
import PromotionUsage from "../models/PromotionUsage.js";
import CustomerGroup from "../models/CustomerGroup.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";
import Collection from "../models/Collection.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { CALC_FIELDS } from "../config/calc-fields.js";
import { invalidateRenderPromotionCache } from "../utils/render-promotions.js";
import { revalidateClientTags } from "../utils/revalidate-client.js";

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

const RULE_OPERATORS = new Set([
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  "$contains",
  "$exists",
]);

function normalizeRules(raw: any): { field: string; operator: string; value: any }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rule: any) => ({
      field: String(rule?.field ?? "").trim(),
      operator: String(rule?.operator ?? "$eq"),
      value: rule?.value ?? null,
    }))
    .filter(
      (rule) => !!rule.field && RULE_OPERATORS.has(rule.operator),
    );
}

function normalizeScope(scope: any) {
  const raw = String(scope?.appliesTo ?? "all");
  const appliesTo = (["all", "products", "categories", "brands", "rules"].includes(
    raw,
  )
    ? raw
    : "all") as "all" | "products" | "categories" | "brands" | "rules";
  return {
    appliesTo,
    match: (scope?.match === "any" ? "any" : "all") as "all" | "any",
    rules: appliesTo === "rules" ? normalizeRules(scope?.rules) : [],
    productIds: appliesTo === "products" ? (scope?.productIds ?? []) : [],
    categoryIds: appliesTo === "categories" ? (scope?.categoryIds ?? []) : [],
    brandIds: appliesTo === "brands" ? (scope?.brandIds ?? []) : [],
    excludeProductIds: scope?.excludeProductIds ?? [],
  };
}

/* ------------------------- rule preview -------------------------------- */

export async function previewPromotionRules(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const body = req.body ?? {};
  const rules = normalizeRules(body.rules);
  const match = body.match === "any" ? "any" : "all";

  let offer: any = null;
  if (body.offerId && isValidId(String(body.offerId))) {
    offer = await Offer.findById(String(body.offerId)).lean();
  }

  const limit = 2000;
  const products: any[] = await Product.find({ status: "active" })
    // Rules may reference dynamic category attributes, so keep the document
    // intact (only drop the heavy embedding vectors).
    .select("-embedding -embeddingText -embeddingModel")
    .limit(limit)
    .lean();

  const { matchesPromotionRules } = await import("../utils/promotion-rules.js");
  const matched = products.filter((product) =>
    matchesPromotionRules(product, rules, match, { offer }),
  );

  res.json({
    data: {
      count: matched.length,
      truncated: products.length >= limit,
      sample: matched.slice(0, 8).map((product) => ({
        _id: String(product._id),
        name: product.name,
        price: product.price,
        image: Array.isArray(product.images) ? product.images[0] : undefined,
      })),
    },
  });
}

/* -------------------------- composer options ---------------------------- */

export async function getPromotionOptions(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const [
    customerGroups,
    promotions,
    products,
    categories,
    brands,
    offers,
    collections,
  ] = await Promise.all([
      CustomerGroup.find().lean(),
      Promotion.find().select("name _id").sort({ createdAt: -1 }).lean(),
      Product.find()
        .select("name _id sku price images")
        .sort({ createdAt: -1 })
        .lean(),
      Category.find().select("name _id slug").sort({ name: 1 }).lean(),
      Brand.find().select("name _id url_slug").sort({ name: 1 }).lean(),
      Offer.find({ isActive: true })
        .select("name type discountValue conditions.endDate")
        .sort({ createdAt: -1 })
        .lean(),
      Collection.find().select("name _id").sort({ name: 1 }).lean(),
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
      offers: offers.map((o: any) => ({
        value: o._id.toString(),
        label: o.name,
        sublabel: o.type,
      })),
      collections: collections.map((c: any) => ({
        value: c._id.toString(),
        label: c.name,
      })),
    },
  });
}

function offerToPromotionType(offer: any): {
  name: string;
  code?: string;
  description?: string | null;
  calculationType: any;
  properties: any[];
  isActive: boolean;
} {
  const map: Record<string, string> = {
    percentage: "percentage",
    fixed: "fixed_amount",
    bogo: "buy_x_get_y",
    free_shipping: "free_shipping",
    bundle: "bundle_discount",
  };
  const calculationType = map[offer.type] ?? "percentage";
  return {
    name: offer.name,
    code: offer.type,
    description: offer.description ?? null,
    calculationType,
    properties: buildPropertySnapshot(calculationType),
    isActive: offer.isActive !== false,
  };
}

function offerPropertyValues(offer: any): Record<string, any> {
  switch (offer.type) {
    case "percentage":
      return { percentage: Number(offer.discountValue) || 0 };
    case "fixed":
      return { amount: Number(offer.discountValue) || 0 };
    case "bogo":
      return {
        buyQuantity: Number(offer.buyQuantity) || 1,
        getQuantity: Number(offer.getQuantity) || 1,
      };
    case "bundle":
      return {
        discountAmount: Number(offer.discountValue) || 0,
        bundleQuantity: Number(offer.bundleQuantity) || 1,
        productIds: (offer.conditions?.eligibleProducts ?? []).map(String),
      };
    default:
      return {};
  }
}

async function loadOfferType(offerId: string) {
  if (!isValidId(offerId)) {
    throw new ValidationError({ offerId: ["Invalid offer ID"] });
  }
  const offer = await Offer.findById(offerId).lean();
  if (!offer) throw new ValidationError({ offerId: ["Offer not found"] });
  return {
    offer,
    promotionType: offerToPromotionType(offer),
    propertyValues: offerPropertyValues(offer),
  };
}

/* -------------------------------- CRUD ---------------------------------- */

export async function createPromotion(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const data = req.body ?? {};

  if (!data.offerId) {
    throw new ValidationError({ offerId: ["Select an offer"] });
  }

  const loaded = await loadOfferType(String(data.offerId));
  const offerId = String(data.offerId);
  const promotionType = loaded.promotionType;
  const offerValues = loaded.propertyValues;

  const payload = {
    name: data.name,
    description: data.description,
    imageUrl: data.imageUrl || undefined,
    code: data.code?.trim().toUpperCase() || undefined,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    isActive: data.isActive ?? true,
    priority: data.priority ?? 0,
    offerId,
    promotionType,
    scope: normalizeScope(data.scope) as any,
    propertyValues: new Map(
      Object.entries(
        Object.keys(data.propertyValues ?? {}).length > 0
          ? data.propertyValues
          : offerValues,
      ).filter(([, v]) => v !== undefined && v !== null && v !== ""),
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
    invalidateRenderPromotionCache();
    void revalidateClientTags(["blocks", "promotions"]);
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

  let offerPromotionType: any = null;
  let offerValues: Record<string, any> = {};
  if (data.offerId) {
    const loaded = await loadOfferType(String(data.offerId));
    offerPromotionType = loaded.promotionType;
    offerValues = loaded.propertyValues;
  }

  const calculationType =
    data.calculationType ?? existing.promotionType?.calculationType;
  const typeChanged =
    data.calculationType &&
    data.calculationType !== existing.promotionType?.calculationType;

  const promotionType = offerPromotionType
    ? offerPromotionType
    : typeChanged
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
    ...(data.offerId
      ? {
          propertyValues: new Map(
            Object.entries(offerValues).filter(
              ([, v]) => v !== undefined && v !== null && v !== "",
            ),
          ),
        }
      : {}),
    offerId:
      data.offerId !== undefined ? data.offerId || null : existing.offerId ?? null,
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
    invalidateRenderPromotionCache();
    void revalidateClientTags(["blocks", "promotions"]);
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
  invalidateRenderPromotionCache();
  void revalidateClientTags(["blocks", "promotions"]);
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