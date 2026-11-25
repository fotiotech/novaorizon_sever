/**
 * Shared promotion rule evaluator.
 *
 * Rules are intentionally evaluated in JS, not translated into Mongo queries:
 * the same predicate must drive render-time decoration and checkout pricing.
 * Supported paths cover Product fields (`price`, `tags`, `stats.purchases`,
 * `attributes.color`, …) and `offer.*` fields when the promotion is backed by
 * a reusable Offer.
 */

export type PromotionRuleOperator =
  | "$eq"
  | "$ne"
  | "$gt"
  | "$gte"
  | "$lt"
  | "$lte"
  | "$in"
  | "$nin"
  | "$contains"
  | "$exists";

export interface PromotionRule {
  field: string;
  operator: PromotionRuleOperator | string;
  value?: any;
}

function readPath(source: any, path: string): any {
  if (!source) return undefined;
  return path.split(".").reduce((acc: any, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, source);
}

function readRuleValue(
  field: string,
  product: any,
  offer: any,
): { found: boolean; value: any } {
  if (field.startsWith("offer.")) {
    if (!offer) return { found: false, value: undefined };
    const value = readPath(offer, field.slice("offer.".length));
    return { found: value !== undefined, value };
  }

  // Allow both `color` and `attributes.color` for dynamic category attributes.
  const direct = readPath(product, field);
  if (direct !== undefined) return { found: true, value: direct };

  if (field.startsWith("attributes.")) {
    const bare = field.slice("attributes.".length);
    const aliased = readPath(product, bare);
    return { found: aliased !== undefined, value: aliased };
  }

  const attribute = readPath(product, `attributes.${field}`);
  return { found: attribute !== undefined, value: attribute };
}

function toComparable(value: any): any {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (value.trim() !== "" && Number.isFinite(asNumber)) return asNumber;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return asDate;
    }
  }
  return value;
}

function toArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (value === undefined || value === null) return [];
  return [value];
}

export function matchesPromotionRules(
  product: any,
  rules: PromotionRule[] | undefined,
  match: "all" | "any" = "all",
  context: { offer?: any } = {},
): boolean {
  const list = Array.isArray(rules) ? rules.filter((r) => r?.field) : [];
  if (list.length === 0) return true;

  const results = list.map((rule) => {
    const operator = String(rule.operator ?? "$eq");
    const expected = rule.value;
    const { found, value } = readRuleValue(
      rule.field,
      product,
      context.offer,
    );

    switch (operator) {
      case "$exists":
        return found === (expected === true || expected === "true");
      case "$eq":
        return found && String(value) === String(expected);
      case "$ne":
        return !found || String(value) !== String(expected);
      case "$in":
        return found && toArray(expected).some((v) => String(v) === String(value));
      case "$nin":
        return !found || !toArray(expected).some((v) => String(v) === String(value));
      case "$contains": {
        if (!found) return false;
        if (Array.isArray(value)) {
          return value.some((v) => String(v) === String(expected));
        }
        return String(value).toLowerCase().includes(String(expected).toLowerCase());
      }
      case "$gt":
      case "$gte":
      case "$lt":
      case "$lte": {
        if (!found) return false;
        const a = toComparable(value);
        const b = toComparable(expected);
        if (operator === "$gt") return a > b;
        if (operator === "$gte") return a >= b;
        if (operator === "$lt") return a < b;
        return a <= b;
      }
      default:
        return false;
    }
  });

  return match === "any" ? results.some(Boolean) : results.every(Boolean);
}

function hasAnyEligibility(eligibility: any): boolean {
  if (!eligibility) return false;
  return (
    (eligibility.productIds?.length ?? 0) > 0 ||
    (eligibility.categoryIds?.length ?? 0) > 0 ||
    (eligibility.brandIds?.length ?? 0) > 0 ||
    (eligibility.collectionIds?.length ?? 0) > 0 ||
    (eligibility.rules?.length ?? 0) > 0
  );
}

/**
 * Offer eligibility: manual product/category/brand targets OR rules.
 * An explicit manual attachment acts as an include override.
 */
export function matchesOfferEligibility(product: any, offer: any): boolean {
  const eligibility = offer?.eligibility;
  if (!hasAnyEligibility(eligibility)) {
    // Legacy offers kept their product list on conditions.eligibleProducts.
    const legacy = toArray(offer?.conditions?.eligibleProducts).map(String);
    if (legacy.length > 0) return legacy.includes(String(product?._id));
    return true;
  }

  const manual =
    toArray(eligibility.productIds).map(String).includes(String(product?._id)) ||
    toArray(eligibility.categoryIds)
      .map(String)
      .includes(String(product?.categoryId)) ||
    toArray(eligibility.brandIds)
      .map(String)
      .includes(String(product?.brand)) ||
    (offer?._collectionProductIds instanceof Set &&
      offer._collectionProductIds.has(String(product?._id)));

  if (manual) return true;

  const rules = Array.isArray(eligibility.rules)
    ? eligibility.rules.filter((rule: any) => rule?.field)
    : [];
  if (rules.length === 0) return false;

  return matchesPromotionRules(
    product,
    rules,
    eligibility.match === "any" ? "any" : "all",
    { offer },
  );
}

/** Full scope check: manual lists, all, or rules. */
export function promotionMatchesProduct(
  product: any,
  promotion: any,
  offer?: any,
): boolean {
  const scope = promotion?.scope ?? {};
  const appliesTo = scope.appliesTo ?? "all";

  const excluded = toArray(scope.excludeProductIds).map(String);
  if (excluded.includes(String(product?._id))) return false;

  // Offer-backed promotions take their target set from the offer.
  if (offer && hasAnyEligibility(offer.eligibility)) {
    return matchesOfferEligibility(product, offer);
  }

  if (appliesTo === "all") return true;
  if (appliesTo === "rules") {
    return matchesPromotionRules(
      product,
      scope.rules,
      scope.match === "any" ? "any" : "all",
      { offer },
    );
  }
  if (appliesTo === "products") {
    return toArray(scope.productIds)
      .map(String)
      .includes(String(product?._id));
  }
  if (appliesTo === "categories") {
    return toArray(scope.categoryIds)
      .map(String)
      .includes(String(product?.categoryId));
  }
  if (appliesTo === "brands") {
    return toArray(scope.brandIds)
      .map(String)
      .includes(String(product?.brand));
  }
  return false;
}