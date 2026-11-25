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

export interface RenderPricing {
  originalPrice: number;
  promotionalPrice: number;
  discount: number;
  appliedPromotionId: string | null;
}

function priceEffectFor(product: any, promotion: RenderPromotion): number {
  const base = Number(product?.price) || 0;
  if (base <= 0) return 0;
  const type = promotion.offer?.type ?? promotion.calculationType;
  const value = Number(
    promotion.offer?.discountValue ?? promotion.discount ?? 0,
  );
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (type === "percentage") {
    return Math.min(base, Math.round((base * value) / 100));
  }
  if (type === "fixed" || type === "fixed_amount") {
    return Math.min(base, value);
  }
  return 0;
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
