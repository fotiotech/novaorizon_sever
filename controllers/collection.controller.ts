import type { Request, Response } from "express";
import mongoose from "mongoose";
import {
  Collection,
  TARGET_TYPES,
  type TargetType,
} from "../models/Collection.js";
import {
  COLLECTION_TYPES,
  COLLECTION_MANUAL_LIMIT,
  CTA_STYLES,
} from "../config/collection-types.js";
import { buildQueryFromRules } from "../utils/content-query.js";
import { getEntityConfig, type RegistryKey } from "../utils/entity-registry.js";
import { getRecommendationResolver } from "../utils/recommendation-resolvers.js";
import { deleteS3Object } from "../utils/s3.js";
import { connection } from "../config/db.js";
import { normalizeContentItem } from "../utils/content-resolve.js";
import { decorateItemsWithPromotions } from "../utils/render-promotions.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function normalizeTarget(raw: unknown): TargetType | null {
  const t = String(raw ?? "");
  return (TARGET_TYPES as readonly string[]).includes(t)
    ? (t as TargetType)
    : null;
}

function validateRules(rules: any[], targetType: TargetType) {
  const cfg = getEntityConfig(targetType);
  if (!cfg) return { error: "Unknown target type" };
  const allowed = new Set(cfg.attributes.map((a) => a.value));

  for (const [i, rule] of rules.entries()) {
    if (!rule.attribute || !rule.operator)
      return { error: `Rule ${i + 1}: attribute and operator are required` };
    if (!allowed.has(rule.attribute))
      return {
        error: `Rule ${i + 1}: "${rule.attribute}" is not a valid ${targetType} attribute`,
      };
    if (rule.value === undefined || rule.value === null || rule.value === "")
      return { error: `Rule ${i + 1}: value is required` };
  }
  return null;
}

function validateItems(items: string[], targetType: TargetType) {
  if (items.length > COLLECTION_MANUAL_LIMIT) {
    return {
      error: `A manual collection can contain at most ${COLLECTION_MANUAL_LIMIT} items.`,
    };
  }
  for (const id of items) {
    if (!mongoose.Types.ObjectId.isValid(id))
      return { error: `Invalid ${targetType} ID: ${id}` };
  }
  return null;
}

function validateRecommendation(
  targetType: TargetType,
  kind: string,
  limit: number,
) {
  const cfg = getEntityConfig(targetType);
  if (!cfg) return { error: "Unknown target type" };
  if (!cfg.supportsRecommendation)
    return { error: `${cfg.label} collections do not support recommendations` };
  if (!kind || !cfg.recommendationTypes?.includes(kind)) {
    return { error: `Invalid recommendation kind for ${cfg.singular}` };
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return { error: "Recommendation limit must be between 1 and 100" };
  }
  return null;
}



function readCta(body: any) {
  const raw = String(body?.ctaStyle ?? "none");
  const ctaStyle = (CTA_STYLES as readonly string[]).includes(raw)
    ? raw
    : "none";
  const ctaText = String(body?.ctaText ?? "").trim();
  const ctaLink = String(body?.ctaLink ?? "").trim();
  // A CTA needs a link; the label is optional (the storefront supplies a
  // sensible default when it is empty).
  return ctaStyle !== "none" && !ctaLink
    ? { ctaStyle: "none" as const, ctaText: undefined, ctaLink: undefined }
    : { ctaStyle, ctaText: ctaText || undefined, ctaLink: ctaLink || undefined };
}

function readSort(body: any) {
  const field = String(body?.sort?.field ?? "").trim();
  const direction =
    String(body?.sort?.direction ?? "asc") === "desc" ? "desc" : "asc";
  return field ? { field, direction } : undefined;
}

/* ------------------------------- reads ---------------------------------- */

export async function getAllCollections(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const targetType = req.query.targetType as string | undefined;
  const filter: any = {};
  if (targetType) filter.targetType = targetType;
  const docs = await Collection.find(filter).sort({ order: 1, created_at: -1 });
  res.json({ data: JSON.parse(JSON.stringify(docs)) });
}

export async function getResolvedCollections(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const targetType = req.query.targetType as TargetType | undefined;
  const status = req.query.status as "active" | "inactive" | undefined;
  const resolveRecommendations = req.query.resolveRecommendations === "true";

  const filter: any = {};
  if (targetType) filter.targetType = targetType;
  if (status) filter.status = status;

  const id = String(req.query.id ?? "").trim();
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    filter._id = new mongoose.Types.ObjectId(id);
  }

  const docs = await Collection.find(filter)
    .sort({ order: 1, created_at: -1 })
    .populate("items")
    .lean();

  const results = await Promise.all(
    docs.map(async (c: any) => {
      const cfg = getEntityConfig(c.targetType);
      let items: any[] = [];

      if (!cfg) items = [];
      else if (c.type === "manual") items = c.items ?? [];
      else if (c.type === "rule") {
        const query = buildQueryFromRules(c.rules ?? [], c.targetType);
        if (Object.keys(query).length > 0) {
          let q = (cfg.model as any).find(query).limit(COLLECTION_MANUAL_LIMIT);
          if (c.sort?.field)
            q = q.sort({ [c.sort.field]: c.sort.direction === "asc" ? 1 : -1 });
          items = await q.lean();
        }
      } else if (c.type === "recommendation" && resolveRecommendations) {
        const resolver = getRecommendationResolver(c.targetType);
        if (resolver)
          items = await resolver(
            c.recommendationType ?? "",
            c.recommendationLimit ?? 10,
          );
      }

      return {
        collection: {
          _id: c._id,
          name: c.name,
          description: c.description,
          imageUrl: c.imageUrl,
          type: c.type,
          targetType: c.targetType,
          rules: c.rules,
          items: c.items,
          status: c.status,
          order: c.order,
          sort: c.sort ?? null,
          ctaText: c.ctaText ?? null,
          ctaLink: c.ctaLink ?? null,
          ctaStyle: c.ctaStyle ?? "none",
          recommendationType: c.recommendationType ?? null,
          recommendationLimit: c.recommendationLimit ?? null,
          created_at: c.created_at,
          updated_at: c.updated_at,
        },
        items: await decorateItemsWithPromotions(
          items.map((item: any) =>
            normalizeContentItem(item, c.targetType as any),
          ),
        ),
        itemCount: items.length,
        isDynamic: c.type === "recommendation",
      };
    }),
  );

  res.json({ data: results });
}

/* ------------------------------ create ---------------------------------- */

export async function createCollection(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const body = req.body ?? {};

  const name = String(body.name ?? "").trim();
  if (!name) throw new ValidationError({ name: ["Name is required"] });

  const targetType = normalizeTarget(body.targetType);
  if (!targetType)
    throw new ValidationError({ targetType: ["Invalid target type"] });

  const cfg = getEntityConfig(targetType);
  if (!cfg) throw new ValidationError({ targetType: ["Unknown target type"] });

  const type = String(body.type ?? "rule");
  if (!(COLLECTION_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError({ type: ["Invalid collection type"] });
  }
  if (type === "rule" && !cfg.supportsRule)
    throw new ValidationError({
      _form: [`Rule collections unsupported for ${cfg.label}`],
    });
  if (type === "manual" && !cfg.supportsManual)
    throw new ValidationError({
      _form: [`Manual collections unsupported for ${cfg.label}`],
    });

  const sort = readSort(body);
  const cta = readCta(body);

  let rules: any[] = [];
  let items: string[] = [];
  let recommendationType: string | undefined;
  let recommendationLimit: number | undefined;

  if (type === "rule") {
    rules = Array.isArray(body.rules) ? body.rules : [];
    rules.forEach((r, i) => {
      if (typeof r.position !== "number") r.position = i;
    });
    const invalid = validateRules(rules, targetType);
    if (invalid) throw new ValidationError({ rules: [invalid.error] });
    rules.sort((a, b) => a.position - b.position);
  } else if (type === "manual") {
    items = Array.isArray(body.items)
      ? Array.from(new Set(body.items.map((v: any) => String(v))))
      : [];
    const invalid = validateItems(items, targetType);
    if (invalid) throw new ValidationError({ items: [invalid.error] });
  } else if (type === "recommendation") {
    recommendationType = String(body.recommendationType ?? "");
    recommendationLimit = Number(body.recommendationLimit) || 10;
    const invalid = validateRecommendation(
      targetType,
      recommendationType,
      recommendationLimit,
    );
    if (invalid) throw new ValidationError({ recommendation: [invalid.error] });
  }

  const existing = await Collection.findOne({ name, targetType });
  if (existing)
    throw new AppError(
      `A ${cfg.singular} collection with this name already exists`,
      409,
    );

  const doc = new Collection({
    name,
    description: String(body.description ?? "").trim(),
    imageUrl: String(body.imageUrl ?? ""),
    status: body.status || "active",
    type,
    targetType,
    rules: type === "rule" ? rules : [],
    items: type === "manual" ? items : [],
    recommendationType,
    recommendationLimit,
    order: Number(body.order) || 0,
    sort,
    ...cta,
  });
  await doc.save();
  res.status(201).json({ success: true, data: doc.toObject() });
}

/* ------------------------------ update ---------------------------------- */

export async function updateCollection(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid collection ID"] });
  await connection();

  const existing = await Collection.findById(id);
  if (!existing) throw new AppError("Collection not found", 404);

  const body = req.body ?? {};
  const name = String(body.name ?? "").trim();
  if (!name) throw new ValidationError({ name: ["Name is required"] });

  const targetType = normalizeTarget(body.targetType);
  if (!targetType)
    throw new ValidationError({ targetType: ["Invalid target type"] });

  const cfg = getEntityConfig(targetType);
  if (!cfg) throw new ValidationError({ targetType: ["Unknown target type"] });

  const type = String(body.type ?? "rule");
  if (!(COLLECTION_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError({ type: ["Invalid collection type"] });
  }

  const sort = readSort(body);

  let rules: any[] = [];
  let items: string[] = [];
  let recommendationType: string | undefined;
  let recommendationLimit: number | undefined;

  if (type === "rule") {
    rules = Array.isArray(body.rules) ? body.rules : [];
    rules.forEach((r, i) => {
      if (typeof r.position !== "number") r.position = i;
    });
    const invalid = validateRules(rules, targetType);
    if (invalid) throw new ValidationError({ rules: [invalid.error] });
    rules.sort((a, b) => a.position - b.position);
  } else if (type === "manual") {
    items = Array.isArray(body.items)
      ? Array.from(new Set(body.items.map((v: any) => String(v))))
      : [];
    const invalid = validateItems(items, targetType);
    if (invalid) throw new ValidationError({ items: [invalid.error] });
  } else if (type === "recommendation") {
    recommendationType = String(body.recommendationType ?? "");
    recommendationLimit = Number(body.recommendationLimit) || 10;
    const invalid = validateRecommendation(
      targetType,
      recommendationType,
      recommendationLimit,
    );
    if (invalid) throw new ValidationError({ recommendation: [invalid.error] });
  }

  const conflict = await Collection.findOne({
    name,
    targetType,
    _id: { $ne: new mongoose.Types.ObjectId(id) },
  });
  if (conflict)
    throw new AppError(
      `Another ${cfg.singular} collection with this name already exists`,
      409,
    );

  const cta = readCta(body);

  existing.set({
    name,
    description: String(body.description ?? "").trim(),
    imageUrl: String(body.imageUrl ?? ""),
    status: body.status || "active",
    type,
    targetType,
    rules: type === "rule" ? rules : [],
    items: type === "manual" ? items : [],
    recommendationType,
    recommendationLimit,
    order: Number(body.order) || 0,
    sort,
    ...cta,
  });
  await existing.save();
  res.json({ success: true, data: existing.toObject() });
}

/* ---------------------------- single/delete ----------------------------- */

export async function getCollectionById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid collection ID"] });
  await connection();
  const doc = await Collection.findById(id).populate("items").lean();
  if (!doc) throw new AppError("Collection not found", 404);
  res.json({ data: doc });
}

export async function deleteCollection(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid collection ID"] });
  await connection();
  const doc = await Collection.findByIdAndDelete(id);
  if (!doc) throw new AppError("Collection not found", 404);
  res.json({ success: true });
}

export async function deleteCollectionImage(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid collection ID"] });
  await connection();
  const doc = await Collection.findById(id);
  if (!doc) throw new AppError("Collection not found", 404);
  if (!doc.imageUrl) throw new AppError("No image to delete", 404);
  await deleteS3Object(doc.imageUrl);
  doc.imageUrl = "";
  await doc.save();
  res.json({ success: true });
}

/* ------------------------- pickers -------------------------------------- */

export async function fetchAvailableItems(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const targetType = String(req.query.targetType ?? "");
  const search = String(req.query.search ?? "");
  const sortOrder =
    String(req.query.sortOrder ?? "asc") === "desc" ? "desc" : "asc";

  const cfg = getEntityConfig(targetType);
  if (!cfg)
    throw new ValidationError({
      targetType: [`Unsupported target type: ${targetType}`],
    });

  const filter: any = {};
  if (search)
    filter.name = {
      $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };

  const docs = await (cfg.model as any)
    .find(filter)
    .sort({ name: sortOrder === "asc" ? 1 : -1 })
    .limit(COLLECTION_MANUAL_LIMIT)
    .lean();

  res.json({
    data: (docs as any[]).map((doc) => ({
      _id: String(doc._id),
      name: doc.name || "Untitled",
      imageUrl: cfg.image(doc) ?? null,
    })),
  });
}

export async function fetchReferenceOptions(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const refType = param(req, "refType") as RegistryKey;
  const search = String(req.query.search ?? "");

  const cfg = getEntityConfig(refType);
  if (!cfg) throw new ValidationError({ refType: ["Unknown reference type"] });

  const filter: any = {};
  if (search)
    filter.name = {
      $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };

  const docs = await (cfg.model as any)
    .find(filter)
    .select("_id name")
    .limit(50)
    .lean();
  res.json({
    data: (docs as any[]).map((d) => ({
      _id: String(d._id),
      name: d.name || "Untitled",
    })),
  });
}