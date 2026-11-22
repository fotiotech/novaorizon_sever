/**
 * Removes the retired inherited-property snapshots and their pointers.
 *
 *   npx tsx scripts/cleanup-inherited-properties.ts          # dry run
 *   npx tsx scripts/cleanup-inherited-properties.ts --apply
 *
 * Safe to run before or after deploying the code that drops the fields:
 * reads resolve the ancestor chain on demand.
 */
import mongoose from "mongoose";
import { connection } from "../config/db.js";
import CategoryProperty from "../models/CategoryProperty.js";
import Category from "../models/Category.js";

async function main() {
  const apply = process.argv.includes("--apply");
  await connection();

  const snapshots = await CategoryProperty.countDocuments({
    $or: [{ readOnly: true }, { snapshotOf: { $exists: true } }],
  });
  const pointers = await Category.countDocuments({
    inheritedProperty: { $exists: true },
  });

  console.log(`Snapshots to delete: ${snapshots}. Category pointers to clear: ${pointers}.`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply.");
    return;
  }

  const deleted = await CategoryProperty.deleteMany({
    $or: [{ readOnly: true }, { snapshotOf: { $exists: true } }],
  });
  const cleared = await Category.updateMany(
    { inheritedProperty: { $exists: true } },
    { $unset: { inheritedProperty: "" } },
  );
  // Legacy field on any remaining property docs.
  await CategoryProperty.updateMany(
    { snapshotOf: { $exists: true } },
    { $unset: { snapshotOf: "" } },
  );

  // The inheritance job queue is retired too.
  await mongoose.connection.db
    ?.dropCollection("inheritancejobs")
    .catch(() => undefined);

  console.log(
    `Deleted ${deleted.deletedCount} snapshot(s); cleared ${cleared.modifiedCount} pointer(s).`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});