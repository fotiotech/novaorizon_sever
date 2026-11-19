/**
 * Migrates legacy flat block presentation (`displayConfig` + `sourceStyles`)
 * to the per-display/per-source `presentation` shape.
 *
 *   npx tsx scripts/migrate-block-presentation.ts
 *
 * Safe to re-run: blocks without legacy fields are skipped, and the legacy keys
 * are removed only after the new shape has been written.
 */
import mongoose from "mongoose";
import { connection } from "../config/db.js";
import Block from "../models/Block.js";
import { normalizePresentation } from "../utils/block-presentation.js";

async function main() {
  await connection();

  const cursor = Block.find({
    $or: [
      { displayConfig: { $exists: true } },
      { sourceStyles: { $exists: true } },
    ],
  }).cursor();

  let migrated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const display = (doc as any).display ?? "grid";
    const sourceType = (doc as any).source?.type ?? "collection";

    const presentation = normalizePresentation(
      {
        displayConfig: (doc as any).displayConfig,
        sourceStyles: (doc as any).sourceStyles,
      },
      display,
      sourceType,
    );

    const hasAny =
      Object.keys(presentation.common).length +
        Object.keys(presentation.display).length +
        Object.keys(presentation.source).length >
      0;

    if (!hasAny) {
      skipped++;
      continue;
    }

    await Block.updateOne(
      { _id: doc._id },
      {
        $set: { presentation },
        $unset: { displayConfig: "", sourceStyles: "" },
      },
    );
    migrated++;
  }

  console.log(
    `[migrate-block-presentation] migrated=${migrated} skipped=${skipped}`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
