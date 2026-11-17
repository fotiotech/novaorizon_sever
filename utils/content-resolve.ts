import mongoose from "mongoose";
import { Collection } from "../models/Collection.js";
import { buildQueryFromRules, pickSlug } from "./content-query.js";
import { getEntityConfig } from "./entity-registry.js";
import { getRecommendationResolver } from "./recommendation-resolvers.js";
import type { BlockRefModel } from "../config/content.constants.js";

export interface ResolveContext {
  userId?: string;
}

export interface NormalizedContentItem {
  _id: string;
  name: string;
  image: string | null;
  description?: string | null;
  href: string;
  contentType: BlockRefModel;
  price?: number | null;
  listPrice?: number | null;
  badge?: string | null;
  subline?: string | null;
  meta?: { code?: string };
  averageRating?: number | null;
  reviewCount?: number | null;
}

function buildHref(
  refModel: BlockRefModel,
  refId: string,
  slug: string | null,
  url?: string | null,
): string {
  if (refModel === "Page" && url) return url;
  const prefix: Record<BlockRefModel, string> = {
    Product: "products",
    Category: "category",
    Collection: "collections",
    Brand: "brands",
    Promotion: "promotions",
    Page: "pages",
  };
  const p = prefix[refModel];
  return slug ? `/${p}/${slug}/${refId}` : `/${p}/${refId}`;
}

function firstImage(doc: any): string | null {
  if (Array.isArray(doc.images) && doc.images.length > 0) return doc.images[0];
  if (Array.isArray(doc.imageUrl) && doc.imageUrl.length > 0)
    return doc.imageUrl[0];
  return doc.image ?? doc.mainImage ?? doc.logoUrl ?? doc.featuredImage ?? null;
}

function computeRating(
  doc: any,
): { averageRating: number; reviewCount: number } | null {
  if (typeof doc.averageRating === "number" && doc.averageRating > 0) {
    return {
      averageRating: doc.averageRating,
      reviewCount: Math.max(0, Number(doc.reviewCount) || 0),
    };
  }
  if (Array.isArray(doc.reviewsRatings) && doc.reviewsRatings.length > 0) {
    const sum = doc.reviewsRatings.reduce(
      (s: number, r: any) => s + (Number(r?.rating) || 0),
      0,
    );
    return {
      averageRating: sum / doc.reviewsRatings.length,
      reviewCount: doc.reviewsRatings.length,
    };
  }
  return null;
}

function normalizeProduct(doc: any): NormalizedContentItem {
  const rating = computeRating(doc);
  return {
    _id: String(doc._id),
    name: doc.name || "Untitled",
    image: firstImage(doc),
    description: doc.shortDescription ?? null,
    href: buildHref("Product", String(doc._id), pickSlug(doc) || null),
    contentType: "Product",
    price: typeof doc.price === "number" ? doc.price : null,
    listPrice: typeof doc.listPrice === "number" ? doc.listPrice : null,
    averageRating: rating?.averageRating ?? null,
    reviewCount: rating?.reviewCount ?? null,
  };
}

function normalizeCategory(doc: any): NormalizedContentItem {
  return {
    _id: String(doc._id),
    name: doc.name || "Untitled",
    image: firstImage(doc),
    description: doc.description ?? null,
    href: buildHref("Category", String(doc._id), pickSlug(doc) || null),
    contentType: "Category",
  };
}

function normalizeCollection(doc: any): NormalizedContentItem {
  return {
    _id: String(doc._id),
    name: doc.name || "Untitled",
    image: firstImage(doc),
    description: doc.description ?? null,
    href: buildHref("Collection", String(doc._id), pickSlug(doc) || null),
    contentType: "Collection",
  };
}

function normalizeBrand(doc: any): NormalizedContentItem {
  return {
    _id: String(doc._id),
    name: doc.name || "Untitled",
    image: firstImage(doc),
    href: buildHref(
      "Brand",
      String(doc._id),
      doc.url_slug ?? pickSlug(doc) ?? null,
    ),
    contentType: "Brand",
  };
}

function normalizePromotion(doc: any): NormalizedContentItem {
  return {
    _id: String(doc._id),
    name: doc.name || "Untitled",
    image: null,
    description: doc.description ?? null,
    href: buildHref("Promotion", String(doc._id), null),
    contentType: "Promotion",
    badge: doc.code ?? null,
    meta: { code: doc.code ?? undefined },
  };
}

function normalizePage(doc: any): NormalizedContentItem {
  return {
    _id: String(doc._id),
    name: doc.name || doc.title || "Untitled",
    image: firstImage(doc),
    href: buildHref("Page", String(doc._id), pickSlug(doc) || null, doc.url),
    contentType: "Page",
  };
}

export function normalizeContentItem(
  doc: any,
  refModel: BlockRefModel,
): NormalizedContentItem {
  switch (refModel) {
    case "Product":
      return normalizeProduct(doc);
    case "Category":
      return normalizeCategory(doc);
    case "Collection":
      return normalizeCollection(doc);
    case "Brand":
      return normalizeBrand(doc);
    case "Promotion":
      return normalizePromotion(doc);
    case "Page":
    default:
      return normalizePage(doc);
  }
}

export async function resolveCollection(
  collectionId: string | mongoose.Types.ObjectId,
  ctx: ResolveContext = {},
  limitOverride?: number,
): Promise<NormalizedContentItem[]> {
  const collection: any = await Collection.findById(collectionId).lean();
  if (!collection || collection.status === "inactive") return [];

  const limit =
    limitOverride ??
    (collection.type === "recommendation"
      ? (collection.recommendationLimit ?? 10)
      : 20);

  const targetType = collection.targetType as BlockRefModel;
  const cfg = getEntityConfig(targetType);
  if (!cfg) return [];

  if (collection.type === "recommendation") {
    const resolver = getRecommendationResolver(targetType);
    if (!resolver) return [];
    const raw = await resolver(collection.recommendationType ?? "", limit, {
      userId: ctx.userId,
    });
    return raw.map((d) => normalizeContentItem(d, targetType));
  }

  if (collection.type === "rule") {
    const query = buildQueryFromRules(
      collection.rules ?? [],
      targetType as any,
    );
    if (Object.keys(query).length === 0) return [];
    let q = (cfg.model as mongoose.Model<any>).find(query).limit(limit);
    if (collection.sort?.field) {
      q = q.sort({
        [collection.sort.field]: collection.sort.direction === "asc" ? 1 : -1,
      });
    }
    const docs = await q.lean();
    return (docs as any[]).map((d) => normalizeContentItem(d, targetType));
  }

  if (collection.type === "manual") {
    const ids = (collection.items ?? []).slice(0, limit);
    if (!ids.length) return [];
    const docs = await (cfg.model as mongoose.Model<any>)
      .find({ _id: { $in: ids } })
      .lean();
    const byId = new Map((docs as any[]).map((d) => [String(d._id), d]));
    return ids
      .map((id: any) => byId.get(String(id)))
      .filter(Boolean)
      .map((d: any) => normalizeContentItem(d, targetType));
  }

  return [];
}
