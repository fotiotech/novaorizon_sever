/**
 * One-off normalisation of legacy order statuses into the lifecycle model.
 *
 *   npx tsx scripts/migrate-order-statuses.ts
 *
 * Maps "in transit" → shipped and "completed" → delivered, fills the lifecycle
 * timestamps from the existing milestone fields, and seeds `statusHistory`
 * for orders that have none. Re-runnable and idempotent.
 */
import mongoose from "mongoose";
import { connection } from "../config/db.js";
import Order from "../models/Order.js";
import { normalizeOrderStatus } from "../utils/order-lifecycle.js";

async function main() {
  await connection();

  const cursor = Order.find({}).cursor();
  let updated = 0;

  for await (const order of cursor) {
    const doc: any = order;
    const target = normalizeOrderStatus(doc.orderStatus) ?? "pending";

    const timestamps: Record<string, Date | null> = {};
    if (doc.shippingDate) timestamps.shippedAt = doc.shippingDate;
    if (doc.deliveryDate) timestamps.deliveredAt = doc.deliveryDate;
    if (doc.returnRequestedAt) timestamps.returnRequestedAt = doc.returnRequestedAt;
    if (doc.refundedAt) timestamps.returnedAt = doc.refundedAt;
    if (target === "cancelled" && !doc.cancelledAt) timestamps.cancelledAt = doc.updatedAt;

    const shouldSeedHistory =
      !Array.isArray(doc.statusHistory) || doc.statusHistory.length === 0;

    const history: any[] = [];
    if (shouldSeedHistory) {
      history.push({ status: "pending", at: doc.createdAt ?? new Date() });
      const milestones: Array<[string, Date | null | undefined]> = [
        ["confirmed", doc.paidAt],
        ["shipped", doc.shippingDate],
        ["delivered", doc.deliveryDate],
        ["return_requested", doc.returnRequestedAt],
        ["returned", doc.refundedAt],
        ["cancelled", target === "cancelled" ? doc.updatedAt : null],
      ];
      for (const [status, at] of milestones) {
        if (at) history.push({ status, at });
      }
      // Ensure the current status is represented, with a fallback timestamp.
      if (!history.some((e) => e.status === target)) {
        history.push({ status: target, at: doc.updatedAt ?? new Date() });
      }
    }

    const updates: Record<string, any> = {};
    if (doc.orderStatus !== target) updates.orderStatus = target;
    for (const [field, value] of Object.entries(timestamps)) {
      if (value && !doc[field]) updates[field] = value;
    }

    if (Object.keys(updates).length === 0 && !shouldSeedHistory) continue;

    await Order.updateOne(
      { _id: doc._id },
      {
        ...(Object.keys(updates).length ? { $set: updates } : {}),
        ...(shouldSeedHistory ? { $set: { ...updates, statusHistory: history } } : {}),
      },
    );
    updated += 1;
  }

  console.log(`[migrate-order-statuses] updated=${updated}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
