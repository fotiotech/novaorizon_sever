/**
 * The standalone `tiles` display was replaced by the `cardStyle: "tile"`
 * presentation option. Converts existing blocks.
 *
 *   npx tsx scripts/migrate-tile-display.ts          # dry run
 *   npx tsx scripts/migrate-tile-display.ts --apply
 */
import mongoose from "mongoose";
import { connection } from "../config/db.js";
import Block from "../models/Block.js";

async function main() {
  const apply = process.argv.includes("--apply");
  await connection();

  const filter: any = { display: "tiles" };
  const count = await Block.countDocuments(filter);
  console.log(`Blocks using display="tiles": ${count}`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to convert them to grid + tile cards.");
    return;
  }

  const result = await Block.updateMany(filter, {
    $set: {
      display: "grid",
      "presentation.display.cardStyle": "tile",
    },
  });
  console.log(`Converted ${result.modifiedCount} block(s).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
