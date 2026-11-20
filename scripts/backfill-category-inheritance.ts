/**
 * One-off backfill: regenerate inherited property snapshots for categories
 * that are set to inherit but have none (rows created before inheritance
 * became fully automatic).
 *
 *   npx tsx scripts/backfill-category-inheritance.ts
 *
 * Re-runnable; categories that already have a snapshot are refreshed too.
 */
import mongoose from "mongoose";
import { connection } from "../config/db.js";
import Category from "../models/Category.js";
import {
  applyInheritedPropertyToCategory,
  ensureCategoryPropertyFromMappings,
} from "../utils/category-inheritance.js";

async function main() {
  await connection();

  const categories = await Category.find({})
    .select("_id parentId inheritProperty inheritedProperty")
    .lean();

  const byParent = new Map<string, any[]>();
  const roots: any[] = [];
  for (const c of categories as any[]) {
    const parent = c.parentId?.toString() ?? null;
    if (!parent) roots.push(c);
    else {
      const list = byParent.get(parent) ?? [];
      list.push(c);
      byParent.set(parent, list);
    }
  }

  let refreshed = 0;
  let cleared = 0;
  const queue = [...roots];

  while (queue.length) {
    const node = queue.shift()!;
    const id = node._id.toString();
    const isRoot = !node.parentId;

    if (node.inheritProperty === true && !isRoot) {
      const before = node.inheritedProperty?.toString() ?? null;
      const { propertyId } = await applyInheritedPropertyToCategory(id);
      if (propertyId) refreshed += 1;
      else if (before) cleared += 1;
    } else if (node.inheritedProperty) {
      // Root or inheritance-off rows must not hold a snapshot.
      await ensureCategoryPropertyFromMappings(id, []);
      cleared += 1;
    }

    queue.push(...(byParent.get(id) ?? []));
  }

  console.log(
    `[backfill-category-inheritance] refreshed=${refreshed} cleared=${cleared} total=${categories.length}`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
