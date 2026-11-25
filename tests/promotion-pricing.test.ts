import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Node's type-stripping runner needs the .ts specifier.
import { resolveRenderPricing } from "../utils/promotion-pricing.ts";

const promotion = (id: string, type: string, value: number) => ({
  _id: id,
  name: id,
  label: id,
  description: null,
  code: null,
  calculationType: type,
  discount: value,
  offerId: "o1",
  priority: 0,
  startDate: "",
  endDate: "",
  offer: {
    name: id,
    type,
    discountValue: value,
    buyQuantity: null,
    getQuantity: null,
    bundleQuantity: null,
  },
});

test("pricing: percentage discount", () => {
  const pricing = resolveRenderPricing({ price: 200 }, [
    promotion("p1", "percentage", 15),
  ]);
  assert.equal(pricing.originalPrice, 200);
  assert.equal(pricing.discount, 30);
  assert.equal(pricing.promotionalPrice, 170);
});

test("pricing: fixed discount clamped to price", () => {
  const pricing = resolveRenderPricing({ price: 50 }, [
    promotion("p1", "fixed", 80),
  ]);
  assert.equal(pricing.discount, 50);
  assert.equal(pricing.promotionalPrice, 0);
});

test("pricing: best of multiple promotions", () => {
  const pricing = resolveRenderPricing({ price: 100 }, [
    promotion("p1", "percentage", 10),
    promotion("p2", "fixed", 25),
  ]);
  assert.equal(pricing.discount, 25);
  assert.equal(pricing.appliedPromotionId, "p2");
});

test("pricing: BXGY/bundle have no single-product price effect", () => {
  const pricing = resolveRenderPricing({ price: 100 }, [
    promotion("p1", "bogo", 0),
    promotion("p2", "bundle", 0),
  ]);
  assert.equal(pricing.discount, 0);
  assert.equal(pricing.promotionalPrice, 100);
  assert.equal(pricing.appliedPromotionId, null);
});

test("pricing: no price yields no discount", () => {
  const pricing = resolveRenderPricing({ price: 0 }, [
    promotion("p1", "percentage", 20),
  ]);
  assert.equal(pricing.promotionalPrice, 0);
  assert.equal(pricing.discount, 0);
});