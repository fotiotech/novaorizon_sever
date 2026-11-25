/**
 * Backfills the enriched Product fields introduced for merchandising:
 *   - ratingAverage / ratingCount from embedded reviews
 *   - stats counters (zeroed)
 *   - offerIds from active Offers' eligibleProducts
 *
 *   npx tsx scripts/migrate-product-enrichment.ts          # dry run
 *   npx tsx scripts/migrate-product-enrichment.ts --apply
 */
import mongoose from "mongoose";
import { connection } from "../config/db.js";
import Product from "../models/Product.js";
import Offer from "../models/Offer.js";

async function main() {
  const apply = process.argv.includes("--apply");
  await connection();

  const reviews = await Product.aggregate([
    {
      $project: {
        ratingCount: { $size: { $ifNull: ["$reviewsRatings", []] } },
        ratingAverage: { $ifNull: [{ $avg: "$reviewsRatings.rating" }, 0] },
      },
    },
  ]);

  const offers: any[] = await Offer.find({ isActive: true })
    .select("_id conditions.eligibleProducts")
    .lean();

  const offerMap = new Map<string, mongoose.Types.ObjectId[]>();
  for (const offer of offers) {
    for (const productId of offer.conditions?.eligibleProducts ?? []) {
      const key = String(productId);
      if (!offerMap.has(key)) offerMap.set(key, []);
      offerMap.get(key)!.push(offer._id);
    }
  }

  console.log(
    `Products with reviews: ${reviews.filter((r) => r.ratingCount > 0).length}. Products covered by offers: ${offerMap.size}.`,
  );

  if (!apply) {
    console.log("Dry run. Re-run with --apply.");
    return;
  }

  if (reviews.length > 0) {
    await Product.bulkWrite(
      reviews.map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: {
            $set: {
              ratingCount: row.ratingCount,
              ratingAverage: Math.round(row.ratingAverage * 100) / 100,
            },
          },
        },
      })),
      { ordered: false },
    );
  }

  await Product.updateMany(
    { ratingCount: { $exists: false } },
    { $set: { ratingCount: 0, ratingAverage: 0 } },
  );

  await Product.updateMany(
    { $or: [{ stats: { $exists: false } }, { "stats.views": { $exists: false } }] },
    {
      $set: {
        stats: {
          views: 0,
          cartAdds: 0,
          purchases: 0,
          likes: 0,
          revenue: 0,
          wishlistCount: 0,
          lastEventAt: null,
        },
      },
    },
  );

  for (const [productId, ids] of offerMap) {
    if (!mongoose.Types.ObjectId.isValid(productId)) continue;
    await Product.updateOne(
      { _id: productId },
      { $addToSet: { offerIds: { $each: ids } } },
    );
  }

  console.log(
    `Backfilled ${reviews.length} product rating(s) and ${offerMap.size} offer link(s).`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
