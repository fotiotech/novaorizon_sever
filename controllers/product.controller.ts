import type { Request, Response } from "express";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import slugify from "slugify";
import Product from "../models/Product.js";
import "../models/Brand.js";
import Category from "../models/Category.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { safeValidateProductCreateOrUpdate } from "../schemas/product.schema.js";
import {
  getCategoryAttributeSets,
  type AttributeSetResult,
} from "../utils/category-inheritance.js";
import { saveProductDraftForUser } from "../utils/draft.service.js";
import { NEW_PRODUCT_DRAFT_KEY } from "../utils/draft-keys.js";
import { embedProduct } from "../utils/embedProduct.js";
import { buildEmbeddingText } from "../utils/embedding.js";
import { deleteS3Object } from "../utils/s3.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/* ----------------------------- constants -------------------------------- */

const RECREATE_SOURCE_FIELD = "_recreateSourceId";
const HEX_24 = /^[a-f0-9]{24}$/i;

const normalizeKey = (k: string) =>
  k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/* ----------------------------- helpers ---------------------------------- */

function toObjectId(value: any): mongoose.Types.ObjectId | null {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(value);
  } catch {
    return null;
  }
}

function coerceRef(value: any): mongoose.Types.ObjectId | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!HEX_24.test(t)) return null;
    return toObjectId(t);
  }
  if (
    value instanceof mongoose.Types.ObjectId ||
    value?._bsontype === "ObjectId" ||
    typeof value?.toHexString === "function"
  ) {
    try {
      const hex = value.toHexString();
      return HEX_24.test(hex) ? new mongoose.Types.ObjectId(hex) : null;
    } catch {
      return null;
    }
  }
  if (value?._id !== undefined && value?._id !== null) {
    return coerceRef(value._id);
  }
  return null;
}

function preSanitizeRefs<T extends Record<string, any>>(input: T): T {
  if (!input || typeof input !== "object") return input;
  const out: any = { ...input };
  for (const key of ["brand", "categoryId", "carrier"]) {
    if (key in out) {
      const coerced = coerceRef(out[key]);
      if (coerced instanceof mongoose.Types.ObjectId) {
        out[key] = coerced.toString();
      } else if (coerced === null) {
        out[key] = null;
      } else {
        out[key] = undefined;
      }
    }
  }
  return out;
}

function generateSlug(name: string, department?: string | null): string {
  return slugify(`${name}${department ? `-${department}` : ""}`, {
    lower: true,
  });
}

function normalizeStatus(status: unknown): "draft" | "active" | "inactive" {
  const s = String(status ?? "draft").toLowerCase();
  if (s === "active" || s === "inactive" || s === "draft") {
    return s as "draft" | "active" | "inactive";
  }
  return "draft";
}

function sanitizeProductCode(
  code: any,
): { type: string; value: string } | null {
  if (code === undefined || code === null) return null;
  let raw = code;
  for (let i = 0; i < 5 && Array.isArray(raw); i++) raw = raw[0];
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type || "";
  const value = raw.value || "";
  if (!type || !value) return null;
  return { type: String(type), value: String(value) };
}

function normalizeVariantValuesMap(
  data: any,
): Record<string, string[]> | undefined {
  if (!data) return undefined;

  const absorbObject = (obj: Record<string, any>) => {
    const out: Record<string, string[]> = {};
    Object.entries(obj).forEach(([k, v]) => {
      const key = normalizeKey(k);
      if (!key) return;
      out[key] = Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : v !== undefined && v !== null
          ? [String(v)]
          : [];
    });
    return out;
  };

  if (Array.isArray(data)) {
    const isKvArray =
      data.length > 0 &&
      data.every((x) => x && typeof x === "object" && "k" in x && "v" in x);
    if (isKvArray) {
      const out: Record<string, string[]> = {};
      data.forEach((item: any) => {
        const key = normalizeKey(item.k);
        if (!key) return;
        out[key] = Array.isArray(item.v) ? item.v : [item.v];
      });
      return out;
    }
    if (data.length === 1 && data[0] && typeof data[0] === "object") {
      return absorbObject(data[0]);
    }
    return undefined;
  }
  if (typeof data === "object") return absorbObject(data);
  return undefined;
}

function serialize(doc: any): any {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : doc;
  return JSON.parse(JSON.stringify(obj));
}

interface CategoryAttributeInfo {
  requiredCodes: string[];
  variantThemeCodes: Set<string>;
  variantFieldCodes: Set<string>;
}

async function getCategoryAttributeInfo(
  categoryId: string,
): Promise<CategoryAttributeInfo> {
  const attributeSets: AttributeSetResult[] =
    await getCategoryAttributeSets(categoryId);
  const requiredCodes: string[] = [];
  const variantThemeCodes = new Set<string>();
  const variantFieldCodes = new Set<string>();

  const walk = (groups: any[]) => {
    for (const group of groups ?? []) {
      const groupCode = normalizeKey(String(group.code ?? ""));
      for (const attr of group.attributes ?? []) {
        if (!attr.code) continue;
        if (attr.isRequired) {
          if (attr.code !== "sale_price" && attr.code !== "salePrice") {
            requiredCodes.push(attr.code);
          }
        }
        // Attributes flagged `isVariant` in the category property define the
        // variant axes. The group-code convention is kept as a fallback for
        // properties authored before the flag existed.
        if (attr.isVariant || groupCode === "variantThemes")
          variantThemeCodes.add(normalizeKey(attr.code));
        if (groupCode === "variantFields")
          variantFieldCodes.add(normalizeKey(attr.code));
      }
      if (group.children?.length) walk(group.children);
    }
  };
  for (const set of attributeSets) walk(set.groups);

  return { requiredCodes, variantThemeCodes, variantFieldCodes };
}

function clampInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Stable identity for a variant row, derived from its axis values. */
function variantKey(v: any, themes: string[]): string {
  return themes
    .map((t) => String(v?.[normalizeKey(t)] ?? v?.[t] ?? ""))
    .join("|");
}

function sanitizeVariantData(
  payload: Record<string, any>,
  categoryVariantThemes: Set<string>,
  existingVariants: any[] = [],
): void {
  const wantsVariants = payload.hasVariants === true;

  if (categoryVariantThemes.size === 0 || !wantsVariants) {
    payload.hasVariants = false;
    payload.variants = [];
    payload.variantThemes = [];
    payload.variantValues = {};
    return;
  }

  const declaredThemes: string[] = Array.isArray(payload.variantThemes)
    ? payload.variantThemes
        .map((c: any) => String(c))
        .filter((c: string) => categoryVariantThemes.has(normalizeKey(c)))
    : [];

  if (declaredThemes.length === 0) {
    payload.hasVariants = false;
    payload.variants = [];
    payload.variantThemes = [];
    payload.variantValues = {};
    return;
  }

  payload.variantThemes = declaredThemes;

  if (Array.isArray(payload.variants)) {
    payload.variants = payload.variants.filter((v: any) => {
      if (!v || typeof v !== "object") return false;
      return declaredThemes.every((theme) => {
        const key = normalizeKey(theme);
        const value = v[key] ?? v[theme];
        return value !== undefined && value !== null && value !== "";
      });
    });
  } else {
    payload.variants = [];
  }

  // Variant inventory is server-managed:
  //  - `variantId` is generated once and kept stable across saves
  //  - `reserved` is never taken from the client
  //  - `quantity` / `lowStockThreshold` are clamped numbers
  const existingByKey = new Map<string, any>();
  for (const v of existingVariants ?? []) {
    existingByKey.set(variantKey(v, declaredThemes), v);
  }

  payload.variants = payload.variants.map((v: any) => {
    const prev = existingByKey.get(variantKey(v, declaredThemes));
    return {
      ...v,
      variantId:
        typeof v.variantId === "string" && v.variantId
          ? v.variantId
          : (prev?.variantId ?? randomUUID()),
      quantity: clampInt(v.quantity ?? prev?.quantity, 0),
      lowStockThreshold: clampInt(
        v.lowStockThreshold ?? prev?.lowStockThreshold,
        5,
      ),
      reserved: clampInt(prev?.reserved, 0),
    };
  });

  // Keep the product-level stock meaningful for listings/filters.
  payload.quantity = payload.variants.reduce(
    (sum: number, v: any) => sum + clampInt(v.quantity, 0),
    0,
  );

  const allowedKeys = new Set(declaredThemes.map(normalizeKey));
  const raw = payload.variantValues;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const filtered: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (allowedKeys.has(normalizeKey(k))) filtered[k] = v;
    }
    payload.variantValues = filtered;
  } else {
    payload.variantValues = {};
  }
}

function stripRecreateMarker<T extends Record<string, any>>(payload: T): T {
  if (payload && typeof payload === "object") {
    delete (payload as any)[RECREATE_SOURCE_FIELD];
  }
  return payload;
}

async function hardDeleteProduct(
  objectId: mongoose.Types.ObjectId,
  session?: mongoose.ClientSession,
): Promise<boolean> {
  await Product.updateMany(
    { "relatedProducts.product": objectId },
    { $pull: { relatedProducts: { product: objectId } } },
    { session },
  );
  const removed = await Product.findByIdAndDelete(objectId, { session });
  return !!removed;
}

type PrepareResult =
  | {
      ok: true;
      payload: Record<string, any>;
      providedId: mongoose.Types.ObjectId | null;
    }
  | { ok: false; error: string };

async function prepareProductPayload(formData: any): Promise<PrepareResult> {
  const sanitized = preSanitizeRefs(formData ?? {});
  const validated = safeValidateProductCreateOrUpdate(sanitized);
  if (!validated.success) {
    return { ok: false, error: `Validation failed: ${validated.error}` };
  }

  const data: any = { ...sanitized, ...(validated.data ?? {}) };
  const providedId = data._id ? toObjectId(data._id) : null;
  if (data._id && !providedId)
    return { ok: false, error: "Invalid product id" };

  const baseData: any = { ...data };
  delete baseData._id;

  const nextCategory = coerceRef(data.categoryId);
  const nextBrand = coerceRef(data.brand);
  const nextCarrier = coerceRef(data.carrier);

  if (
    nextCategory === null &&
    data.categoryId != null &&
    data.categoryId !== ""
  ) {
    return { ok: false, error: "Invalid category" };
  }
  if (nextBrand === null && data.brand != null && data.brand !== "") {
    return { ok: false, error: "Invalid brand" };
  }

  let categoryInfo: CategoryAttributeInfo | null = null;
  if (nextCategory) {
    try {
      categoryInfo = await getCategoryAttributeInfo(nextCategory.toString());
    } catch (e: any) {
      return {
        ok: false,
        error: e?.message || "Failed to load category attributes",
      };
    }

    const missing: string[] = [];
    for (const code of categoryInfo.requiredCodes) {
      const camel = normalizeKey(code);
      const value = data[camel];
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && !value.trim()) ||
        (Array.isArray(value) && value.length === 0);
      if (empty) missing.push(code);
    }
    if (missing.length) {
      return {
        ok: false,
        error: `Missing required fields: ${missing.join(", ")}`,
      };
    }
  }

  const payload: any = {
    ...baseData,
    status: normalizeStatus(data.status),
    updatedAt: new Date(),
  };

  delete payload.brand;
  delete payload.carrier;
  delete payload.categoryId;
  delete payload[RECREATE_SOURCE_FIELD];

  if (nextCategory !== undefined) payload.categoryId = nextCategory;
  if (nextBrand !== undefined) payload.brand = nextBrand;
  if (nextCarrier !== undefined) payload.carrier = nextCarrier;

  if (data.name) payload.slug = generateSlug(data.name, data.department);

  if (data.type && data.value) {
    payload.productCode = { type: data.type, value: data.value };
    delete payload.type;
    delete payload.value;
  } else if (data.productCode !== undefined) {
    payload.productCode = sanitizeProductCode(data.productCode);
  }
  if (payload.productCode !== undefined && payload.productCode !== null) {
    payload.productCode = sanitizeProductCode(payload.productCode);
  }

  if (
    data.relatedProducts !== undefined &&
    Array.isArray(data.relatedProducts)
  ) {
    payload.relatedProducts = data.relatedProducts
      .map((rp: any) => {
        if (!rp) return null;
        const rawId = rp.id ?? rp.product?._id ?? rp.product?.id ?? rp.product;
        const product = toObjectId(rawId);
        if (!product) return null;
        return { product, relationshipType: rp.relationshipType || "" };
      })
      .filter(Boolean);
  }

  if (payload.variantValues !== undefined) {
    const normalized = normalizeVariantValuesMap(payload.variantValues);
    if (normalized) payload.variantValues = normalized;
    else delete payload.variantValues;
  }

  if (Array.isArray(payload.variantThemes)) {
    payload.variantThemes = payload.variantThemes.map((c: any) =>
      normalizeKey(String(c)),
    );
  }

  if (Array.isArray(payload.variants)) {
    payload.variants = payload.variants.map((v: any) => {
      if (!v || typeof v !== "object") return v;
      const next = { ...v };
      if (Array.isArray(next.mainImage))
        next.mainImage = next.mainImage[0] || "";
      if (Array.isArray(next.images)) next.images = next.images.filter(Boolean);
      Object.keys(next).forEach((key) => {
        const val = next[key];
        if (
          val &&
          typeof val === "object" &&
          "value" in val &&
          Object.keys(val).length <= 2
        ) {
          next[key] = (val as any).value;
        }
      });
      return next;
    });
  }

  delete payload.keyFeatures;
  delete payload.specifications;

  let existingForVariants: any = null;
  if (providedId) {
    existingForVariants = await Product.findById(providedId)
      .select("variants")
      .lean();
  }

  sanitizeVariantData(
    payload,
    categoryInfo?.variantThemeCodes ?? new Set<string>(),
    (existingForVariants?.variants as any[]) ?? [],
  );

  let existing: any = null;
  if (providedId) {
    existing = await Product.findById(providedId)
      .select(
        "name categoryName brandName shortDescription description tags embeddingText embedding",
      )
      .lean();
  }

  let categoryName: string | undefined;
  if (nextCategory) {
    const cat = await Category.findById(nextCategory).select("name").lean();
    categoryName = String((cat as any)?.name ?? "").trim();
    payload.categoryName = categoryName;
  } else if (existing) {
    categoryName = existing.categoryName ?? "";
  }

  let brandName: string | undefined;
  if (nextBrand) {
    const Brand = mongoose.model("Brand");
    const br = await Brand.findById(nextBrand).select("name").lean();
    brandName = String((br as any)?.name ?? "").trim();
    payload.brandName = brandName;
  } else if (existing) {
    brandName = existing.brandName ?? "";
  }

  const embedSource = {
    name: payload.name ?? existing?.name ?? "",
    categoryName: categoryName ?? existing?.categoryName ?? "",
    brandName: brandName ?? existing?.brandName ?? "",
    shortDescription:
      payload.shortDescription ?? existing?.shortDescription ?? "",
    description: payload.description ?? existing?.description ?? "",
    tags: payload.tags ?? existing?.tags ?? [],
  };

  if (embedSource.name) {
    const nextEmbeddingText = buildEmbeddingText(embedSource);
    const alreadyCurrent =
      existing?.embeddingText === nextEmbeddingText &&
      Array.isArray(existing?.embedding) &&
      existing.embedding.length > 0;

    if (!alreadyCurrent) {
      const embedded = await embedProduct(embedSource);
      if (embedded) {
        payload.embedding = embedded.embedding;
        payload.embeddingText = embedded.embeddingText;
        payload.embeddingModel = embedded.embeddingModel;
        payload.embeddedAt = embedded.embeddedAt;
      }
    }
  }

  return { ok: true, payload, providedId };
}

/* ----------------------------- handlers --------------------------------- */

export async function findProductById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  await connection();
  const product = await Product.findById(id).lean();
  if (!product) throw new AppError("Product not found", 404);
  res.json({ data: serialize(product) });
}

export async function findProducts(req: Request, res: Response): Promise<void> {
  await connection();

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const skip = (page - 1) * pageSize;
  const sortField = String(req.query.sort ?? "createdAt");
  const sortDir: 1 | -1 = req.query.sortDir === "asc" ? 1 : -1;

  const filter: Record<string, any> = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (
    req.query.categoryId &&
    mongoose.Types.ObjectId.isValid(String(req.query.categoryId))
  ) {
    filter.categoryId = new mongoose.Types.ObjectId(
      String(req.query.categoryId),
    );
  }
  const q = String(req.query.q ?? "").trim();
  if (q) filter.$text = { $search: q };

  const sort: Record<string, any> = { [sortField]: sortDir };

  const pipeline: any[] = [
    { $match: filter },
    { $sort: sort },
    { $skip: skip },
    { $limit: pageSize },
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "_cat",
      },
    },
    { $unwind: { path: "$_cat", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "brands",
        localField: "brand",
        foreignField: "_id",
        as: "_brand",
      },
    },
    { $unwind: { path: "$_brand", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        name: 1,
        sku: 1,
        slug: 1,
        images: 1,
        tags: 1,
        status: 1,
        quantity: 1,
        lowStockThreshold: 1,
        listPrice: 1,
        price: 1,
        createdAt: 1,
        categoryId: {
          $cond: [
            { $ifNull: ["$_cat._id", false] },
            { _id: "$_cat._id", name: "$_cat.name" },
            null,
          ],
        },
        brand: {
          $cond: [
            { $ifNull: ["$_brand._id", false] },
            { _id: "$_brand._id", name: "$_brand.name" },
            null,
          ],
        },
      },
    },
  ];

  const [rows, total] = await Promise.all([
    Product.aggregate(pipeline).exec(),
    Product.countDocuments(filter),
  ]);

  res.json({
    data: {
      products: rows.map(serialize),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function listProducts(req: Request, res: Response): Promise<void> {
  await connection();
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const sort = { createdAt: -1 as -1 };

  const query: any = {};
  const filter = req.query as any;
  if (filter.isActive !== undefined)
    query.isActive = filter.isActive === "true";
  if (filter.categoryId && mongoose.Types.ObjectId.isValid(filter.categoryId)) {
    query.categoryId = new mongoose.Types.ObjectId(filter.categoryId);
  }
  if (filter.brandId && mongoose.Types.ObjectId.isValid(filter.brandId)) {
    query.brand = new mongoose.Types.ObjectId(filter.brandId);
  }
  if (filter.search && String(filter.search).trim()) {
    query.name = { $regex: String(filter.search).trim(), $options: "i" };
  }

  const [rows, total] = await Promise.all([
    Product.find(query)
      .select("_id name price sku images")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(query),
  ]);

  res.json({
    data: {
      data: rows.map((p: any) => ({
        _id: p._id.toString(),
        name: p.name,
        price: p.price,
        sku: p.sku,
        image: Array.isArray(p.images) ? (p.images[0] ?? "") : "",
      })),
      total,
      limit,
      skip,
    },
  });
}

export async function getProductFilterCategories(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const rows = await Product.aggregate([
    { $match: { categoryId: { $ne: null } } },
    { $group: { _id: "$categoryId" } },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "cat",
      },
    },
    { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, id: { $toString: "$_id" }, name: "$cat.name" } },
    { $match: { name: { $ne: null } } },
    { $sort: { name: 1 } },
  ]);
  res.json({ data: rows });
}

export async function createProduct(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const rawSourceId =
    req.body && typeof req.body === "object"
      ? req.body[RECREATE_SOURCE_FIELD]
      : undefined;

  const prepared = await prepareProductPayload(req.body);
  if (!prepared.ok) throw new ValidationError({ _form: [prepared.error] });

  if (prepared.providedId) {
    throw new ValidationError({
      _id: [
        "Cannot create a product with an existing _id. Use updateProduct instead.",
      ],
    });
  }

  const now = new Date();
  const payload = stripRecreateMarker({
    ...prepared.payload,
    createdAt: now,
    updatedAt: now,
  });

  let sourceObjectId: mongoose.Types.ObjectId | null = null;
  if (typeof rawSourceId === "string" && HEX_24.test(rawSourceId.trim())) {
    sourceObjectId = new mongoose.Types.ObjectId(rawSourceId.trim());
  }

  let usedTransaction = false;
  let deletedSourceId: string | null = null;
  let product: any = null;

  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (sourceObjectId) {
          await hardDeleteProduct(sourceObjectId, session);
          deletedSourceId = sourceObjectId.toString();
        }
        const doc = new Product(payload);
        product = await doc.save({ session });
      });
      usedTransaction = true;
    } finally {
      await session.endSession();
    }
  } catch (txError: any) {
    const msg = String(txError?.message ?? "");
    const txUnsupported =
      /Transaction numbers are only allowed/i.test(msg) ||
      /replica set/i.test(msg) ||
      /mongos/i.test(msg) ||
      txError?.codeName === "IllegalOperation" ||
      txError?.code === 20;

    if (!txUnsupported) throw txError;
    console.warn(
      "[createProduct] Transactions unavailable — running sequentially.",
    );
  }

  if (!usedTransaction) {
    if (sourceObjectId) {
      const removed = await hardDeleteProduct(sourceObjectId);
      if (removed) deletedSourceId = sourceObjectId.toString();
    }
    const doc = new Product(payload);
    product = await doc.save();
  }

  if (!product)
    throw new AppError("Failed to create product (no document returned)", 500);

  res.status(201).json({
    success: true,
    data: {
      product: serialize(product),
      ...(deletedSourceId ? { deletedSourceId } : {}),
    },
  });
}

export async function updateProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!id) throw new ValidationError({ id: ["Product ID required"] });
  const objectId = toObjectId(id);
  if (!objectId) throw new ValidationError({ id: ["Invalid product ID"] });

  await connection();

  const prepared = await prepareProductPayload(req.body);
  if (!prepared.ok) throw new ValidationError({ _form: [prepared.error] });

  const payload = stripRecreateMarker({ ...prepared.payload });
  delete payload.createdAt;
  delete payload._id;
  delete payload.__v;
  payload.updatedAt = new Date();

  if (payload.productCode !== undefined) {
    payload.productCode = sanitizeProductCode(payload.productCode);
  }
  if (payload.brand === undefined) delete payload.brand;
  if (payload.categoryId === undefined) delete payload.categoryId;
  if (payload.carrier === undefined) delete payload.carrier;

  const product = await Product.findByIdAndUpdate(
    objectId,
    { $set: payload, $unset: { keyFeatures: "", specifications: "" } },
    { new: true, runValidators: true },
  );
  if (!product) throw new AppError("Product not found", 404);

  res.json({ success: true, data: serialize(product) });
}

export async function updateProductCategory(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "id");
  const categoryId = (req.body?.categoryId ?? null) as string | null;
  if (!productId) throw new ValidationError({ id: ["Product ID required"] });

  const pid = toObjectId(productId);
  if (!pid) throw new ValidationError({ id: ["Invalid product ID"] });
  if (!categoryId)
    throw new ValidationError({ categoryId: ["Category is required"] });

  const nextCategory = toObjectId(categoryId);
  if (!nextCategory)
    throw new ValidationError({ categoryId: ["Invalid category ID"] });

  await connection();
  const category = await Category.findById(nextCategory).select("_id");
  if (!category) throw new AppError("Category not found", 404);

  const product = await Product.findByIdAndUpdate(
    pid,
    { $set: { categoryId: nextCategory, updatedAt: new Date() } },
    { new: true },
  );
  if (!product) throw new AppError("Product not found", 404);

  res.json({ success: true, data: serialize(product) });
}

export async function updateProductStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "id");
  const status = req.body?.status as string | undefined;
  if (!productId) throw new ValidationError({ id: ["Product ID required"] });
  const pid = toObjectId(productId);
  if (!pid) throw new ValidationError({ id: ["Invalid product ID"] });

  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized !== "active" &&
    normalized !== "inactive" &&
    normalized !== "draft"
  ) {
    throw new ValidationError({ status: ["Invalid status"] });
  }

  await connection();
  const product = await Product.findByIdAndUpdate(
    pid,
    { $set: { status: normalized, updatedAt: new Date() } },
    { new: true },
  );
  if (!product) throw new AppError("Product not found", 404);
  res.json({ success: true, data: serialize(product) });
}

export async function recreateProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  const draftKey = (req.body?.draftKey ?? NEW_PRODUCT_DRAFT_KEY) as string;
  if (!id) throw new ValidationError({ id: ["Product ID required"] });
  if (!draftKey)
    throw new ValidationError({ draftKey: ["Draft key required"] });

  const objectId = toObjectId(id);
  if (!objectId) throw new ValidationError({ id: ["Invalid product ID"] });

  await connection();
  const original: any = await Product.findById(objectId).lean();
  if (!original) throw new AppError("Product not found", 404);

  const draftData: any = { ...original };
  delete draftData._id;
  delete draftData.__v;
  delete draftData.createdAt;
  delete draftData.updatedAt;
  delete draftData.keyFeatures;
  delete draftData.specifications;
  delete draftData.slug;

  const brandId = coerceRef(original.brand);
  const categoryId = coerceRef(original.categoryId);
  const carrierId = coerceRef(original.carrier);
  draftData.brand = brandId ? brandId.toString() : "";
  draftData.categoryId = categoryId ? categoryId.toString() : "";
  draftData.carrier = carrierId ? carrierId.toString() : "";

  draftData.productCode = sanitizeProductCode(original.productCode);

  if (Array.isArray(draftData.relatedProducts)) {
    draftData.relatedProducts = draftData.relatedProducts
      .map((rp: any) => {
        const pid = coerceRef(rp?.product);
        if (!pid) return null;
        return {
          product: pid.toString(),
          relationshipType: rp?.relationshipType || "",
        };
      })
      .filter(Boolean);
  }

  draftData.status = "draft";
  draftData.reviewsRatings = [];
  draftData[RECREATE_SOURCE_FIELD] = id;

  await saveProductDraftForUser(req.user!.id, draftKey, draftData);

  res.json({
    success: true,
    data: { sourceProductId: id, draftKey },
  });
}

export async function deleteProduct(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!id) throw new ValidationError({ id: ["Product ID required"] });
  const objectId = toObjectId(id);
  if (!objectId) throw new ValidationError({ id: ["Invalid product ID"] });

  await connection();
  const product = await Product.findById(objectId);
  if (!product) throw new AppError("Product not found", 404);

  await Product.updateMany(
    { "relatedProducts.product": objectId },
    { $pull: { relatedProducts: { product: objectId } } },
  );
  await Product.findByIdAndDelete(objectId);

  res.json({ success: true, data: "Product deleted successfully" });
}

export async function deleteProductImages(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = (req.query.productId as string | undefined) ?? undefined;
  const imageUrl = (req.query.imageUrl as string | undefined) ?? undefined;

  if (!productId && !imageUrl) {
    throw new ValidationError({ _form: ["productId or imageUrl required"] });
  }

  const deleteFromStorage = async (url: string) => {
    try {
      await deleteS3Object(url);
    } catch (e) {
      console.warn("Failed to delete image from storage:", e);
    }
  };

  await connection();

  if (productId && mongoose.isValidObjectId(productId)) {
    const product = await Product.findById(productId);
    if (!product) throw new AppError("Product not found", 404);

    if (!imageUrl)
      throw new ValidationError({ imageUrl: ["Image URL required"] });

    const images = product.images || [];
    if (!images.includes(imageUrl)) {
      throw new AppError("Image URL not found in product", 404);
    }

    await deleteFromStorage(imageUrl);
    product.images = images.filter((u: string) => u !== imageUrl);
    await product.save();

    res.json({ success: true, data: serialize(product) });
    return;
  }

  if (imageUrl) {
    await deleteFromStorage(imageUrl);
    res.json({ success: true, data: "Image deleted from storage" });
    return;
  }

  throw new ValidationError({ _form: ["Invalid parameters"] });
}

export async function updateProductQuantity(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "id");
  const quantity = Number(req.body?.quantity);
  if (!productId) throw new ValidationError({ id: ["Product ID required"] });
  const pid = toObjectId(productId);
  if (!pid) throw new ValidationError({ id: ["Invalid product ID"] });

  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    !Number.isInteger(quantity)
  ) {
    throw new ValidationError({
      quantity: ["Quantity must be a non-negative whole number"],
    });
  }

  await connection();
  const product = await Product.findByIdAndUpdate(
    pid,
    { $set: { quantity, updatedAt: new Date() } },
    { new: true },
  );
  if (!product) throw new AppError("Product not found", 404);
  res.json({ success: true, data: serialize(product) });
}

export async function updateProductStockLevel(
  req: Request,
  res: Response,
): Promise<void> {
  const productId = param(req, "id");
  const quantity = Number(req.body?.quantity);
  const lowStockThreshold = Number(req.body?.lowStockThreshold);
  if (!productId) throw new ValidationError({ id: ["Product ID required"] });
  const pid = toObjectId(productId);
  if (!pid) throw new ValidationError({ id: ["Invalid product ID"] });

  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    !Number.isInteger(quantity)
  ) {
    throw new ValidationError({
      quantity: ["Quantity must be a non-negative whole number"],
    });
  }
  if (
    !Number.isFinite(lowStockThreshold) ||
    lowStockThreshold < 0 ||
    !Number.isInteger(lowStockThreshold)
  ) {
    throw new ValidationError({
      lowStockThreshold: [
        "Low-stock threshold must be a non-negative whole number",
      ],
    });
  }

  await connection();
  const product = await Product.findByIdAndUpdate(
    pid,
    { $set: { quantity, lowStockThreshold, updatedAt: new Date() } },
    { new: true },
  );
  if (!product) throw new AppError("Product not found", 404);
  res.json({ success: true, data: serialize(product) });
}

export async function getCategoryProductCounts(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const rows = await Product.aggregate([
    { $match: { categoryId: { $ne: null } } },
    { $group: { _id: "$categoryId", count: { $sum: 1 } } },
  ]);
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r && r._id) map[String(r._id)] = Number(r.count) || 0;
  }
  res.json({ data: map });
}