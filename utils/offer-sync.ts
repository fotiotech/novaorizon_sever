import mongoose from "mongoose";
import Product from "../models/Product.js";
import Offer from "../models/Offer.js";

/**
 * Reconciles the many-to-many product ↔ offer relationship.
 *
 * `Offer.conditions.eligibleProducts` stays the source of truth used by
 * checkout; `Product.offerIds` is the denormalised index used by product
 * forms and merchandising queries. Both are updated together.
 */
export async function syncProductOffers(
  productId: string | mongoose.Types.ObjectId,
  offerIds: (string | mongoose.Types.ObjectId)[],
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(String(productId))) return;

  const product = new mongoose.Types.ObjectId(String(productId));
  const ids = [
    ...new Set(
      (offerIds ?? [])
        .map((id) => String(id))
        .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));

  if (ids.length > 0) {
    await Offer.updateMany(
      { _id: { $in: ids } },
      {
        $addToSet: {
          "eligibility.productIds": product,
          "conditions.eligibleProducts": product,
        },
      },
    );
  }

  await Offer.updateMany(
    {
      _id: { $nin: ids },
      "conditions.eligibleProducts": product,
    },
    {
      $pull: {
        "eligibility.productIds": product,
        "conditions.eligibleProducts": product,
      },
    },
  );

  await Product.updateOne({ _id: product }, { $set: { offerIds: ids } });
}