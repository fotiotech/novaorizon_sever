import Promotion from "../models/Promotion.js";
import Product from "../models/Product.js";
import Offer from "../models/Offer.js";
import { promotionMatchesProduct } from "./promotion-rules.js";
import { attachOfferCollectionMembership } from "./offer-membership.js";
import {
  resolveRenderPricing,
  type RenderPromotion,
  type RenderPricing,
} from "./promotion-pricing.js";

export { resolveRenderPricing };
export type { RenderPromotion, RenderPricing };

/** Small in-process cache; promotion writes invalidate it explicitly. */
const CACHE_TTL_MS = 30_000;
let cache:
  | { at: number; promotions: any[]; offerMap: Map<string, any> }
  | null = null;

export function invalidateRenderPromotionCache(): void {
  cache = null;
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