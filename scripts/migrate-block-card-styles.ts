/**
 * Retires the old block-level tile presentation now that tiles are their own
 * CRUD entity.
 *
 *   npx tsx scripts/migrate-block-card-styles.ts          # dry run
 *   npx tsx scripts/migrate-block-card-styles.ts --apply
 */
import mongoose from "mongoose";
import { connection } from "../config/db.js";
import Block from "../models/Block.js";

async function main() {
  const apply = process.argv.includes("--apply");
  await connection();

  const legacyFilter: any = { display: "tiles" };
  const legacyTiles = await Block.countDocuments(legacyFilter);
  const cardStyles = await Block.countDocuments({
    $or: [
      { "presentation.display.cardStyle": { $exists: true } },
      { "displayConfig.cardStyle": { $exists: true } },
    ],
  });

  console.log(
    `Blocks with display=\"tiles\": ${legacyTiles}. Blocks with a stored cardStyle: ${cardStyles}.`,
  );

  if (!apply) {
    console.log("Dry run. Re-run with --apply.");
    return;
  }

  if (legacyTiles > 0) {
    await Block.updateMany(legacyFilter, { $set: { display: "grid" } });
  }

  const result = await Block.updateMany(
    {
      $or: [
        { "presentation.display.cardStyle": { $exists: true } },
        { "displayConfig.cardStyle": { $exists: true } },
      ],
    },
    {
      $unset: {
        "presentation.display.cardStyle": "",
        "displayConfig.cardStyle": "",
      },
    },
  );

  console.log(
    `Converted ${legacyTiles} legacy tile display(s); cleaned ${result.modifiedCount} block(s).`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});