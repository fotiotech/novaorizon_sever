/**
 * Removes the retired collection presentation fields.
 *
 * Collections no longer carry their own display/CTA config — presentation is
 * owned by content blocks. This unsets the legacy fields.
 *
 *   npx tsx scripts/migrate-collection-display.ts          # dry run
 *   npx tsx scripts/migrate-collection-display.ts --apply
 */
import mongoose from "mongoose";
import { connection } from "../config/db.js";
import { Collection } from "../models/Collection.js";

const LEGACY_FIELDS = ["display", "ctaText", "ctaLink", "ctaStyle", "showName"];

async function main() {
  const apply = process.argv.includes("--apply");
  await connection();

  const filter: any = {
    $or: [
      { display: { $exists: true } },
      { ctaText: { $exists: true } },
      { ctaLink: { $exists: true } },
      { ctaStyle: { $exists: true } },
      { showName: { $exists: true } },
    ],
  };

  const count = await Collection.countDocuments(filter);
  console.log(`Collections with legacy presentation fields: ${count}`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to unset them.");
    return;
  }

  const unset = Object.fromEntries(LEGACY_FIELDS.map((f) => [f, ""]));
  const result = await Collection.updateMany(filter, { $unset: unset });
  console.log(`Updated ${result.modifiedCount} collection(s).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
