import Promotion from "../models/Promotion.js";
import Product from "../models/Product.js";
import Offer from "../models/Offer.js";
import { promotionMatchesProduct } from "./promotion-rules.js";
import { attachOfferCollectionMembership } from "./offer-membership.js";

/** Small in-process cache; promotion writes invalidate it explicitly. */
const CACHE_TTL_MS = 30_000;
let cache:
  | { at: number; promotions: any[]; offerMap: Map<string, any> }
  | null = null;

export function invalidateRenderPromotionCache(): void {
  cache = null;
}

export interface RenderPromotion {
  _id: string;
  name: string;
  label: string;
  description: string | null;
  code: string | null;
  calculationType: string;
  discount: number | null;
  offerId: string | null;
  priority: number;
  startDate: string;
  endDate: string;
  offer: {
    name: string;
    type: string;
    discountValue: number | null;
    buyQuantity: number | null;
    getQuantity: number | null;
    bundleQuantity: number | null;
  } | null;
}

function summarise(
  promotions: any[],
  offerMap: Map<string, any>,
  product: any,
): RenderPromotion[] {
  return promotions
    .filter((promotion) => {
      const offer = promotion.offerId
        ? offerMap.get(String(promotion.offerId))
        : undefined;
      return promotionMatchesProduct(product, promotion, offer);
    })
    .map((promotion) => {
      const offer = promotion.offerId
        ? offerMap.get(String(promotion.offerId))
        : undefined;
      return {
        _id: String(promotion._id),
        name: promotion.name,
        label: offer?.name ?? promotion.name,
        description: promotion.description ?? offer?.description ?? null,
        code: promotion.code ?? null,
        calculationType:
          offer?.type ?? promotion.promotionType?.calculationType ?? "percentage",
        discount: offer?.discountValue ?? null,
        offerId: promotion.offerId ? String(promotion.offerId) : null,
        priority: promotion.priority ?? 0,
        startDate: promotion.startDate
          ? new Date(promotion.startDate).toISOString()
          : "",
        endDate: promotion.endDate
          ? new Date(promotion.endDate).toISOString()
          : "",
        offer: offer
          ? {
              name: offer.name,
              type: offer.type,
              discountValue: offer.discountValue ?? null,
              buyQuantity: offer.buyQuantity ?? null,
              getQuantity: offer.getQuantity ?? null,
              bundleQuantity: offer.bundleQuantity ?? null,
            }
          : null,
      };
    });
}

/**
 * Active promotions keyed by product id, evaluated with the shared predicate.
 * The promotion + offer sets are loaded once for the whole page.
 */
function priceEffectFor(product: any, promotion: RenderPromotion): number {
  const base = Number(product?.price) || 0;
  if (base <= 0) return 0;
  const type = promotion.offer?.type ?? promotion.calculationType;
  const value = Number(promotion.offer?.discountValue ?? promotion.discount ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (type === "percentage") {
    return Math.min(base, Math.round((base * value) / 100));
  }
  if (type === "fixed" || type === "fixed_amount") {
    return Math.min(base, value);
  }
  return 0;
}

export interface RenderPricing {
  originalPrice: number;
  promotionalPrice: number;
  discount: number;
  appliedPromotionId: string | null;
}

/** Best single-product price effect; cart-level stacking still wins at checkout. */
export function resolveRenderPricing(
  product: any,
  promotions: RenderPromotion[],
): RenderPricing {
  const originalPrice = Number(product?.price) || 0;
  let best = 0;
  let appliedPromotionId: string | null = null;

  for (const promotion of promotions) {
    const effect = priceEffectFor(product, promotion);
    if (effect > best) {
      best = effect;
      appliedPromotionId = promotion._id;
    }
  }

  const promotionalPrice =
    originalPrice > 0 ? Math.max(0, originalPrice - best) : originalPrice;

  return {
    originalPrice,
    promotionalPrice,
    discount: best,
    appliedPromotionId,
  };
}

export async function resolveRenderPromotionsForProducts(
  products: any[],
): Promise<Map<string, RenderPromotion[]>> {
  const map = new Map<string, RenderPromotion[]>();
  if (!Array.isArray(products) || products.length === 0) return map;

  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    const now = new Date();
    const promotions: any[] = await Promotion.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    const offerIds = [
      ...new Set(
        promotions
          .map((p) => (p.offerId ? String(p.offerId) : null))
          .filter(Boolean) as string[],
      ),
    ];
    const offers: any[] = offerIds.length
      ? await Offer.find({ _id: { $in: offerIds } })
          .select("name type discountValue conditions")
          .lean()
      : [];

    await attachOfferCollectionMembership(offers);
    cache = {
      at: Date.now(),
      promotions,
      offerMap: new Map(offers.map((o) => [String(o._id), o])),
    };
  }

  const { promotions, offerMap } = cache;

  if (promotions.length === 0) {
    for (const product of products) map.set(String(product._id), []);
    return map;
  }

  for (const product of products) {
    map.set(String(product._id), summarise(promotions, offerMap, product));
  }

  return map;
}

export async function resolveRenderPromotions(
  product: any,
): Promise<RenderPromotion[]> {
  const map = await resolveRenderPromotionsForProducts([product]);
  return map.get(String(product._id)) ?? [];
}

/**
 * Attaches render-time promotion summaries to normalized content items
 * (block cards / collection cards). Product items are hydrated in one query.
 */
export async function decorateItemsWithPromotions(
  items: any[],
  options: { showBadge?: boolean } = {},
): Promise<any[]> {
  if (!Array.isArray(items) || items.length === 0) return items;

  const productIds = [
    ...new Set(
      items
        .filter((item) => item?.contentType === "Product" && item?._id)
        .map((item) => String(item._id)),
    ),
  ];
  if (productIds.length === 0) return items;

  const products: any[] = await Product.find({ _id: { $in: productIds } })
    .select("-embedding -embeddingText -embeddingModel")
    .lean();
  const promoMap = await resolveRenderPromotionsForProducts(products);

  return items.map((item) => {
    const promotions = promoMap.get(String(item._id)) ?? [];
    if (promotions.length === 0) return item;
    const pricing = resolveRenderPricing(item, promotions);
    return {
      ...item,
      promotions: options.showBadge === false ? [] : promotions,
      badge:
        options.showBadge === false
          ? item.badge
          : (item.badge ?? promotions[0].label),
      pricing,
    };
  });
}