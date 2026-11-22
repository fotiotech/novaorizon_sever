/**
 * Hero/banner blocks are no longer supported by the content-block engine
 * (banner source/display were removed). This archives any leftover rows so
 * they stop looking like live content.
 *
 *   npx tsx scripts/archive-banner-blocks.ts          # dry run
 *   npx tsx scripts/archive-banner-blocks.ts --apply  # archive them
 */
import mongoose from "mongoose";
import { connection } from "../config/db.js";
import Block from "../models/Block.js";

async function main() {
  const apply = process.argv.includes("--apply");
  await connection();

  // `banner` is no longer a valid enum member — cast for the legacy query.
  const filter: any = {
    $or: [{ "source.type": "banner" }, { display: "banner" }],
  };

  const rows = await Block.find(filter)
    .select("name display source.type status")
    .lean();

  console.log(`Found ${rows.length} banner block(s).`);
  for (const row of rows as any[]) {
    console.log(
      ` - ${row._id} ${row.name} (display=${row.display}, status=${row.status})`,
    );
  }

  if (!apply) {
    console.log("Dry run. Re-run with --apply to archive them.");
    return;
  }

  const result = await Block.updateMany(filter, {
    $set: { status: "inactive" },
  });
  console.log(`Archived ${result.modifiedCount} block(s) (status=inactive).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});