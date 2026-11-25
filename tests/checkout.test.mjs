import test from "node:test";
import assert from "node:assert/strict";
import { calculateDiscount } from "../dist/utils/promotions.service.js";

const cart = (items, subtotal, shippingCost = 0) => ({
  items,
  subtotal,
  shippingCost,
});

const promo = (type, values) => ({
  promotionType: { calculationType: type },
  propertyValues: values,
});

test("checkout: percentage", () => {
  assert.equal(
    calculateDiscount(promo("percentage", { percentage: 20 }), cart([], 100)),
    20,
  );
});

test("checkout: percentage maxDiscount", () => {
  assert.equal(
    calculateDiscount(
      promo("percentage", { percentage: 50, maxDiscount: 15 }),
      cart([], 100),
    ),
    15,
  );
});

test("checkout: fixed amount clamps to subtotal", () => {
  assert.equal(
    calculateDiscount(promo("fixed_amount", { amount: 80 }), cart([], 50)),
    50,
  );
});

test("checkout: buy X get Y", () => {
  const items = [{ productId: "p1", quantity: 3, unitPrice: 30 }];
  assert.equal(
    calculateDiscount(
      promo("buy_x_get_y", {
        buyQuantity: 2,
        getQuantity: 1,
        buyProductIds: ["p1"],
        getProductIds: ["p1"],
      }),
      cart(items, 90),
    ),
    30,
  );
});

test("checkout: bundle requires every product", () => {
  const items = [
    { productId: "p1", quantity: 1, unitPrice: 40 },
    { productId: "p2", quantity: 1, unitPrice: 60 },
  ];
  assert.equal(
    calculateDiscount(
      promo("bundle_discount", {
        productIds: ["p1", "p2"],
        bundleQuantity: 1,
        discountAmount: 15,
      }),
      cart(items, 100),
    ),
    15,
  );

  assert.equal(
    calculateDiscount(
      promo("bundle_discount", {
        productIds: ["p1", "p2"],
        bundleQuantity: 2,
        discountAmount: 15,
      }),
      cart(items, 100),
    ),
    0,
  );
});

test("checkout: free shipping", () => {
  assert.equal(
    calculateDiscount(
      promo("free_shipping", {}),
      cart([], 100, 25),
    ),
    25,
  );
});
