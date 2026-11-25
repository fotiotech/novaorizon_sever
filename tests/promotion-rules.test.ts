import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesOfferEligibility,
  matchesPromotionRules,
  promotionMatchesProduct,
// @ts-ignore Node's type-stripping runner needs the .ts specifier.
} from "../utils/promotion-rules.ts";

const product = {
  _id: "p1",
  name: "Jacket",
  price: 120,
  tags: ["sale", "winter"],
  categoryId: "c1",
  brand: "b1",
  status: "active",
  stats: { purchases: 5 },
  offerIds: ["o1"],
};

test("rules: comparison operators", () => {
  assert.equal(
    matchesPromotionRules(product, [
      { field: "price", operator: "$gte", value: 100 },
    ]),
    true,
  );
  assert.equal(
    matchesPromotionRules(product, [
      { field: "price", operator: "$lt", value: 100 },
    ]),
    false,
  );
});

test("rules: contains on arrays and strings", () => {
  assert.equal(
    matchesPromotionRules(product, [
      { field: "tags", operator: "$contains", value: "winter" },
    ]),
    true,
  );
  assert.equal(
    matchesPromotionRules(product, [
      { field: "name", operator: "$contains", value: "jack" },
    ]),
    true,
  );
});

test("rules: in / nin / exists", () => {
  assert.equal(
    matchesPromotionRules(product, [
      { field: "status", operator: "$in", value: "active,draft" },
    ]),
    true,
  );
  assert.equal(
    matchesPromotionRules(product, [
      { field: "status", operator: "$nin", value: ["draft"] },
    ]),
    true,
  );
  assert.equal(
    matchesPromotionRules(product, [
      { field: "missing", operator: "$exists", value: false },
    ]),
    true,
  );
});

test("rules: all vs any", () => {
  const rules = [
    { field: "price", operator: "$gt", value: 100 },
    { field: "status", operator: "$eq", value: "draft" },
  ];
  assert.equal(matchesPromotionRules(product, rules, "all"), false);
  assert.equal(matchesPromotionRules(product, rules, "any"), true);
});

test("rules: offer.* fields", () => {
  assert.equal(
    matchesPromotionRules(
      product,
      [{ field: "offer.type", operator: "$eq", value: "percentage" }],
      "all",
      { offer: { type: "percentage" } },
    ),
    true,
  );
});

test("offer eligibility: manual product/category/brand", () => {
  const offer = {
    eligibility: {
      productIds: [],
      categoryIds: ["c1"],
      brandIds: [],
      collectionIds: [],
      rules: [],
      match: "all",
    },
  };
  assert.equal(matchesOfferEligibility(product, offer), true);

  const brandOffer = {
    eligibility: { brandIds: ["b1"], rules: [], match: "all" },
  };
  assert.equal(matchesOfferEligibility(product, brandOffer), true);

  const miss = {
    eligibility: { productIds: ["other"], rules: [], match: "all" },
  };
  assert.equal(matchesOfferEligibility(product, miss), false);
});

test("offer eligibility: collection membership + rule fallback", () => {
  const offer = {
    eligibility: {
      productIds: [],
      categoryIds: [],
      brandIds: [],
      collectionIds: ["col1"],
      rules: [{ field: "stats.purchases", operator: "$gte", value: 10 }],
      match: "all",
    },
  };
  assert.equal(matchesOfferEligibility(product, offer), false);

  assert.equal(
    matchesOfferEligibility(product, {
      ...offer,
      _collectionProductIds: new Set(["p1"]),
    }),
    true,
  );

  assert.equal(
    matchesOfferEligibility(product, {
      ...offer,
      _collectionProductIds: new Set(),
    }),
    false,
  );

  assert.equal(
    matchesOfferEligibility({ ...product, stats: { purchases: 12 } }, {
      ...offer,
      _collectionProductIds: new Set(),
    }),
    true,
  );
});

test("legacy offer eligibility falls back to conditions.eligibleProducts", () => {
  const offer = { conditions: { eligibleProducts: ["p1"] } };
  assert.equal(matchesOfferEligibility(product, offer), true);
  assert.equal(matchesOfferEligibility({ ...product, _id: "p2" }, offer), false);
});

test("promotionMatchesProduct: offer wins over legacy scope", () => {
  const promotion = { scope: { appliesTo: "all" } };
  const offer = {
    eligibility: { productIds: ["other"], rules: [], match: "all" },
  };
  assert.equal(promotionMatchesProduct(product, promotion, offer), false);

  assert.equal(
    promotionMatchesProduct(product, promotion, {
      eligibility: { productIds: ["p1"], rules: [], match: "all" },
    }),
    true,
  );
});

test("promotionMatchesProduct: exclusion still applies", () => {
  const promotion = { scope: { appliesTo: "all", excludeProductIds: ["p1"] } };
  assert.equal(promotionMatchesProduct(product, promotion), false);
});