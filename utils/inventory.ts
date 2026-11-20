import mongoose from "mongoose";
import Product from "../models/Product.js";

/**
 * Stock accounting for orders.
 *
 * Products can sell either a single pool (`product.quantity`) or per-variant
 * pools (`product.variants[].quantity`). Variant units are `reserved` when an
 * order is created, then converted to a deduction when payment is confirmed.
 * `reserved` is server-managed and never accepted from the client.
 */

function clampQty(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function applyStockStatus(productId: any): Promise<void> {
  const product: any = await Product.findById(productId)
    .select("hasVariants variants quantity lowStockThreshold")
    .lean();
  if (!product) return;

  const hasVariantStock =
    product.hasVariants === true &&
    Array.isArray(product.variants) &&
    product.variants.length > 0;

  const quantity = hasVariantStock
    ? product.variants.reduce(
        (sum: number, v: any) => sum + (Number(v?.quantity) || 0),
        0,
      )
    : Number(product.quantity) || 0;

  const low = Number(product.lowStockThreshold) || 5;
  const status =
    quantity <= 0 ? "out_of_stock" : quantity <= low ? "low_stock" : "in_stock";

  await Product.updateOne(
    { _id: product._id },
    {
      $set: {
        quantity,
        stock_quantity: quantity,
        stockQuantity: quantity,
        stockStatus: status,
        stock_status: status,
        lastInventoryUpdate: new Date(),
        last_inventory_update: new Date(),
      },
    },
  );
}

function variantIndex(variants: any[], ref: string): number {
  const wanted = String(ref);
  return (variants ?? []).findIndex(
    (v: any) =>
      String(v?.variantId ?? "") === wanted ||
      String(v?._id ?? "") === wanted ||
      String(v?.sku ?? "") === wanted,
  );
}

/** Deduct one order line from variant or product stock. */
export async function deductOrderItem(
  item: any,
): Promise<"ok" | "shortage" | "skipped"> {
  const quantity = clampQty(item?.quantity);
  if (!item?.productId || quantity <= 0) return "skipped";

  const variantId = item.variantId ? String(item.variantId) : null;

  if (variantId) {
    const product: any = await Product.findById(item.productId)
      .select("variants")
      .lean();
    const index = variantIndex(product?.variants ?? [], variantId);
    if (index < 0) return "shortage";

    const base = `variants.${index}`;
    const decremented = await Product.updateOne(
      { _id: item.productId, [`${base}.quantity`]: { $gte: quantity } },
      { $inc: { [`${base}.quantity`]: -quantity } },
    );
    if (decremented.modifiedCount === 0) return "shortage";

    // Release the reservation taken at checkout. Legacy orders created before
    // reservations existed may have no reserved amount, so this is guarded.
    await Product.updateOne(
      { _id: item.productId, [`${base}.reserved`]: { $gte: quantity } },
      { $inc: { [`${base}.reserved`]: -quantity } },
    );

    await applyStockStatus(item.productId);
    return "ok";
  }

  const decremented = await Product.updateOne(
    { _id: item.productId, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity } },
  );
  if (decremented.modifiedCount === 0) return "shortage";

  await applyStockStatus(item.productId);
  return "ok";
}

/** Release the reservation for an order line that will never be fulfilled. */
export async function releaseOrderItem(item: any): Promise<void> {
  const quantity = clampQty(item?.quantity);
  const variantId = item?.variantId ? String(item.variantId) : null;
  if (!item?.productId || !variantId || quantity <= 0) return;

  const product: any = await Product.findById(item.productId)
    .select("variants")
    .lean();
  const index = variantIndex(product?.variants ?? [], variantId);
  if (index < 0) return;

  const base = `variants.${index}`;
  await Product.updateOne(
    { _id: item.productId, [`${base}.reserved`]: { $gte: quantity } },
    { $inc: { [`${base}.reserved`]: -quantity } },
  );
}

/** Put an order line back into stock (returns / cancellations). */
export async function restockOrderItem(item: any): Promise<void> {
  const quantity = clampQty(item?.quantity);
  if (!item?.productId || quantity <= 0) return;

  const variantId = item.variantId ? String(item.variantId) : null;
  if (variantId) {
    const product: any = await Product.findById(item.productId)
      .select("variants")
      .lean();
    const index = variantIndex(product?.variants ?? [], variantId);
    if (index < 0) return;
    await Product.updateOne(
      { _id: item.productId },
      { $inc: { [`variants.${index}.quantity`]: quantity } },
    );
    await applyStockStatus(item.productId);
    return;
  }

  await Product.updateOne(
    { _id: item.productId },
    { $inc: { quantity } },
  );
  await applyStockStatus(item.productId);
}

export async function releaseOrderReservations(order: any): Promise<void> {
  if (!order || order.inventoryDeducted) return;
  for (const item of order.products ?? []) {
    await releaseOrderItem(item);
  }
}

export async function syncProductStock(productId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(productId)) return;
  await applyStockStatus(productId);
}