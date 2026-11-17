import mongoose from "mongoose";
import Category from "../models/Category.js";
import CategoryProperty from "../models/CategoryProperty.js";
import AttributeSet from "../models/AttributeSet.js";
import Attribute from "../models/Attribute.js";
import AttributeGroup from "../models/AttributeGroup.js";
import UnitFamily from "../models/UnitFamily.js";
import { connection } from "../config/db.js";

/* --------------------------- attribute flag shape ------------------------- */

interface AttributeFlags {
  isRequired: boolean;
  isHighlight: boolean;
}

function toFlags(
  input: Partial<AttributeFlags> | undefined | null,
): AttributeFlags {
  return {
    isRequired: input?.isRequired === true,
    isHighlight: input?.isHighlight === true,
  };
}

function mapInputMappings(
  mappings: {
    set: string;
    groups: {
      group: string;
      attributes: {
        attribute: string;
        isRequired?: boolean;
        isHighlight?: boolean;
      }[];
    }[];
  }[],
) {
  return mappings.map((m) => ({
    set: new mongoose.Types.ObjectId(m.set),
    groups: m.groups.map((g) => ({
      group: new mongoose.Types.ObjectId(g.group),
      attributes: g.attributes.map((a) => ({
        attribute: new mongoose.Types.ObjectId(a.attribute),
        ...toFlags(a),
      })),
    })),
  }));
}

function safeIdString(
  value: any,
  depth = 0,
  visited = new WeakSet(),
): string | null {
  if (depth > 10) return null;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number") {
    const str = String(value);
    return mongoose.Types.ObjectId.isValid(str) ? str : null;
  }
  if (Array.isArray(value)) return safeIdString(value[0], depth + 1, visited);
  if (typeof value === "object") {
    if (visited.has(value)) return null;
    visited.add(value);

    if (
      value instanceof mongoose.Types.ObjectId ||
      value._bsontype === "ObjectId" ||
      typeof value.toHexString === "function"
    ) {
      return value.toString();
    }

    const candidates = [value._id, value.id, value.value];
    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== null) {
        const result = safeIdString(candidate, depth + 1, visited);
        if (result) return result;
      }
    }

    try {
      if (typeof value.toString === "function") {
        const str = value.toString();
        if (
          str &&
          str !== "[object Object]" &&
          mongoose.Types.ObjectId.isValid(str)
        ) {
          return str;
        }
      }
    } catch {
      /* ignore */
    }
    visited.delete(value);
  }
  return null;
}

function coerceToObjectId(value: any): mongoose.Types.ObjectId | null {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (value._bsontype === "ObjectId" && typeof value.toString === "function") {
    try {
      const str = value.toString();
      return mongoose.Types.ObjectId.isValid(str)
        ? new mongoose.Types.ObjectId(str)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "string") {
    return mongoose.Types.ObjectId.isValid(value)
      ? new mongoose.Types.ObjectId(value)
      : null;
  }
  return null;
}

function normalizeMappings(mappings: any[]): any[] {
  if (!Array.isArray(mappings)) return [];
  return mappings.map((m: any) => ({
    set: m?.set?.toString?.() ?? m?.set ?? "",
    groups: Array.isArray(m?.groups)
      ? m.groups.map((g: any) => ({
          group: g?.group?.toString?.() ?? g?.group ?? "",
          attributes: Array.isArray(g?.attributes)
            ? g.attributes.map((a: any) => ({
                attribute: a?.attribute?.toString?.() ?? a?.attribute ?? "",
                isRequired: a?.isRequired === true,
                isHighlight: a?.isHighlight === true,
              }))
            : [],
        }))
      : [],
  }));
}

function mergeMappingsWithPrecedence(layers: any[][]): any[] {
  const combinedMap = new Map<
    string,
    {
      set: string;
      groups: Map<
        string,
        { group: string; attributes: Map<string, AttributeFlags> }
      >;
    }
  >();

  for (const layer of layers) {
    if (!Array.isArray(layer)) continue;
    for (const mapping of layer) {
      const setKey = mapping?.set?.toString?.() ?? mapping?.set;
      if (!setKey) continue;
      if (!combinedMap.has(setKey))
        combinedMap.set(setKey, { set: setKey, groups: new Map() });
      const setData = combinedMap.get(setKey)!;

      for (const gm of mapping?.groups ?? []) {
        const groupKey = gm?.group?.toString?.() ?? gm?.group;
        if (!groupKey) continue;
        if (!setData.groups.has(groupKey)) {
          setData.groups.set(groupKey, {
            group: groupKey,
            attributes: new Map(),
          });
        }
        const groupData = setData.groups.get(groupKey)!;
        for (const am of gm?.attributes ?? []) {
          const attrKey = am?.attribute?.toString?.() ?? am?.attribute;
          if (!attrKey) continue;
          groupData.attributes.set(attrKey, toFlags(am));
        }
      }
    }
  }

  return Array.from(combinedMap.values()).map((setData) => ({
    set: setData.set,
    groups: Array.from(setData.groups.values()).map((groupData) => ({
      group: groupData.group,
      attributes: Array.from(groupData.attributes.entries()).map(
        ([attribute, flags]) => ({
          attribute,
          isRequired: flags.isRequired,
          isHighlight: flags.isHighlight,
        }),
      ),
    })),
  }));
}

/* ------------------------- collect ancestor props ------------------------- */

export async function collectAncestorProperties(
  categoryId: string,
): Promise<{ mappings: any[]; propertyIds: string[] }> {
  await connection();
  const propertyIds: string[] = [];
  const visited = new Set<string>();
  let depth = 0;

  const start: any = await Category.findById(categoryId)
    .select("parentId")
    .lean();
  let currentId: string | null = start?.parentId?.toString() || null;

  while (currentId && depth < 20 && !visited.has(currentId)) {
    visited.add(currentId);
    const node: any = await Category.findById(currentId)
      .populate("property")
      .lean();
    if (!node) break;

    const propertyId = safeIdString(node.property);
    if (propertyId) propertyIds.push(propertyId);

    currentId = node.parentId?.toString() || null;
    depth += 1;
  }

  if (propertyIds.length === 0) return { mappings: [], propertyIds: [] };

  const properties = await CategoryProperty.find({
    _id: { $in: propertyIds },
  }).lean();

  const orderIndex = new Map(propertyIds.map((id, i) => [id, i]));
  properties.sort((a: any, b: any) => {
    const ai = orderIndex.get(a._id.toString()) ?? -1;
    const bi = orderIndex.get(b._id.toString()) ?? -1;
    return bi - ai;
  });

  const layers = properties.map((p: any) =>
    normalizeMappings(p.mappings ?? []),
  );

  return {
    mappings: mergeMappingsWithPrecedence(layers),
    propertyIds,
  };
}

/* ------------------------- inherited property code ------------------------ */

function generatePropertyCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function generateInheritedPropertyCode(
  name: string,
  categoryId: string,
): string {
  const base = generatePropertyCode(name) || "category";
  return `${base}_inherited_${categoryId.slice(-8)}`;
}

/* ----------------------- ensure / update snapshot doc --------------------- */

export async function ensureCategoryPropertyFromMappings(
  categoryId: string,
  mappings: any[],
): Promise<string | null> {
  const category = await Category.findById(categoryId).select(
    "name inheritedProperty",
  );
  if (!category) return null;

  if (mappings.length === 0) {
    if (category.inheritedProperty) {
      await CategoryProperty.deleteOne({ _id: category.inheritedProperty });
    }
    await Category.findByIdAndUpdate(categoryId, {
      $set: { inheritedProperty: null },
    });
    return null;
  }

  const code = generateInheritedPropertyCode(category.name, categoryId);
  const propertyName = category.name;
  const propertyDescription = `Auto-generated inherited property for ${category.name}`;
  const prepared = mapInputMappings(mappings);

  let property = await CategoryProperty.findOne({ code });
  if (property) {
    property.name = propertyName;
    property.description = propertyDescription;
    property.readOnly = true;
    property.mappings = prepared as any;
    await property.save();
  } else {
    property = new CategoryProperty({
      code,
      name: propertyName,
      description: propertyDescription,
      readOnly: true,
      mappings: prepared as any,
    });
    await property.save();
  }

  const previousId = category.inheritedProperty?.toString();
  if (previousId && previousId !== property._id.toString()) {
    await CategoryProperty.deleteOne({ _id: previousId });
  }

  await Category.findByIdAndUpdate(categoryId, {
    $set: { inheritedProperty: property._id },
  });

  return property._id.toString();
}

/* -------------------------- apply inheritance ---------------------------- */

export async function applyInheritedPropertyToCategory(
  categoryId: string,
): Promise<{ propertyId: string | null; warning?: string }> {
  await connection();

  const category: any = await Category.findById(categoryId)
    .select("property")
    .lean();
  if (!category) return { propertyId: null, warning: "Category not found." };

  let ownMappings: any[] = [];
  if (category.property) {
    const ownProp: any = await CategoryProperty.findById(
      category.property,
    ).lean();
    if (ownProp?.mappings) ownMappings = normalizeMappings(ownProp.mappings);
  }

  const { mappings: ancestorMappings } =
    await collectAncestorProperties(categoryId);
  const merged = mergeMappingsWithPrecedence([ancestorMappings, ownMappings]);

  if (merged.length === 0) {
    await ensureCategoryPropertyFromMappings(categoryId, []);
    return { propertyId: null, warning: "No properties to inherit or merge." };
  }

  const propertyId = await ensureCategoryPropertyFromMappings(
    categoryId,
    merged,
  );
  return { propertyId };
}

/* ---------------------------- cascade rerun ------------------------------ */

export async function rerunInheritanceForCategoryAndDescendants(
  categoryId: string,
): Promise<void> {
  await connection();
  if (!mongoose.Types.ObjectId.isValid(categoryId)) return;

  const visited = new Set<string>();

  async function walk(nodeId: string): Promise<void> {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node: any = await Category.findById(nodeId)
      .select("inheritProperty parentId")
      .lean();
    if (!node) return;

    if (node.inheritProperty === true && node.parentId) {
      try {
        await applyInheritedPropertyToCategory(nodeId);
      } catch (err) {
        console.error(
          `[inheritance] Failed to re-run for category ${nodeId}:`,
          err,
        );
      }
    }

    const children: any[] = await Category.find({ parentId: nodeId })
      .select("_id")
      .lean();
    for (const child of children) await walk(child._id.toString());
  }

  await walk(categoryId);
}

/* ------------------------------- prune ----------------------------------- */

function collectAttrIdsFromMappings(mappings: any[]): Set<string> {
  const out = new Set<string>();
  for (const m of mappings ?? []) {
    for (const g of m.groups ?? []) {
      for (const a of g.attributes ?? []) {
        const id = a?.attribute?.toString?.();
        if (id) out.add(id);
      }
    }
  }
  return out;
}

async function collectAttrIdsFromPropertyId(
  propertyId: string | null,
): Promise<Set<string>> {
  if (!propertyId) return new Set();
  const prop: any = await CategoryProperty.findById(propertyId)
    .select("mappings")
    .lean();
  return collectAttrIdsFromMappings(prop?.mappings ?? []);
}

async function collectAncestorAttrIds(
  categoryId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  const visited = new Set<string>();

  const self: any = await Category.findById(categoryId)
    .select("parentId")
    .lean();
  if (!self?.parentId) return out;

  let currentId: string | null = self.parentId.toString();
  let depth = 0;

  while (currentId && depth < 30 && !visited.has(currentId)) {
    visited.add(currentId);
    depth += 1;

    const node: any = await Category.findById(currentId)
      .select("property parentId")
      .lean();
    if (!node) break;

    const own = await collectAttrIdsFromPropertyId(
      node.property?.toString() ?? null,
    );
    for (const a of own) out.add(a);

    currentId = node.parentId?.toString() ?? null;
  }

  return out;
}

async function pruneSubtree(
  categoryId: string,
  parentEffective: Set<string>,
  visited: Set<string>,
): Promise<number> {
  if (visited.has(categoryId)) return 0;
  visited.add(categoryId);

  const category: any = await Category.findById(categoryId)
    .select("property inheritedProperty inheritProperty parentId")
    .lean();
  if (!category) return 0;

  const ownAttrs = await collectAttrIdsFromPropertyId(
    category.property?.toString() ?? null,
  );

  const allowed = new Set<string>(parentEffective);
  for (const a of ownAttrs) allowed.add(a);

  let updated = 0;

  if (
    category.inheritProperty === true &&
    category.inheritedProperty &&
    category.parentId
  ) {
    const snapshotId = category.inheritedProperty.toString();
    const snapshot: any = await CategoryProperty.findById(snapshotId)
      .select("mappings")
      .lean();

    if (snapshot?.mappings) {
      let removedAny = false;
      const newMappings: any[] = [];

      for (const m of snapshot.mappings ?? []) {
        const newGroups: any[] = [];
        for (const g of m.groups ?? []) {
          const originalAttrs = g.attributes ?? [];
          const keptAttrs = originalAttrs.filter((a: any) => {
            const id = a?.attribute?.toString?.();
            return id && allowed.has(id);
          });
          if (keptAttrs.length !== originalAttrs.length) removedAny = true;
          if (keptAttrs.length > 0)
            newGroups.push({ group: g.group, attributes: keptAttrs });
        }
        if (newGroups.length !== (m.groups ?? []).length) removedAny = true;
        if (newGroups.length > 0)
          newMappings.push({ set: m.set, groups: newGroups });
      }

      if (removedAny) {
        if (newMappings.length === 0) {
          await CategoryProperty.deleteOne({ _id: snapshotId });
          await Category.findByIdAndUpdate(categoryId, {
            $set: { inheritedProperty: null },
          });
        } else {
          await CategoryProperty.findByIdAndUpdate(snapshotId, {
            $set: { mappings: newMappings },
          });
        }
        updated += 1;
      }
    }
  }

  const children: any[] = await Category.find({ parentId: categoryId })
    .select("_id")
    .lean();
  for (const child of children)
    updated += await pruneSubtree(child._id.toString(), allowed, visited);

  return updated;
}

export async function pruneDescendantSnapshots(
  categoryId: string,
): Promise<number> {
  await connection();
  if (!mongoose.Types.ObjectId.isValid(categoryId)) return 0;
  const ancestorAttrs = await collectAncestorAttrIds(categoryId);
  return pruneSubtree(categoryId, ancestorAttrs, new Set());
}

export async function pruneDescendantsAfterPropertyUpdate(
  propertyId: string,
): Promise<{ categoriesProcessed: number; snapshotsUpdated: number }> {
  await connection();
  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    return { categoriesProcessed: 0, snapshotsUpdated: 0 };
  }

  const categories = await Category.find({
    property: new mongoose.Types.ObjectId(propertyId),
  })
    .select("_id")
    .lean();

  const visited = new Set<string>();
  let snapshotsUpdated = 0;

  for (const c of categories) {
    const categoryId = (c._id as any).toString();
    if (visited.has(categoryId)) continue;
    const ancestorAttrs = await collectAncestorAttrIds(categoryId);
    snapshotsUpdated += await pruneSubtree(categoryId, ancestorAttrs, visited);
  }

  return { categoriesProcessed: categories.length, snapshotsUpdated };
}

/* -------------------- attribute set result shape ------------------------- */

interface AttributeUnitFamily {
  id: string;
  name: string;
  baseUnit: string;
}

export interface MappedAttribute {
  id: string;
  code: string;
  name: string;
  type: string;
  options: string[];
  isRequired: boolean;
  isHighlight: boolean;
  unitFamily: AttributeUnitFamily | null;
  sortOrder: number;
}

export interface GroupNode {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  attributes: MappedAttribute[];
  children: GroupNode[];
}

export interface AttributeSetResult {
  id: string;
  title: string;
  code: string;
  sortOrder: number;
  groups: GroupNode[];
}

export async function buildAttributeSetsFromMappings(
  mappings: {
    set: string;
    groups: {
      group: string;
      attributes: {
        attribute: string;
        isRequired?: boolean;
        isHighlight?: boolean;
      }[];
    }[];
  }[],
): Promise<AttributeSetResult[]> {
  if (!Array.isArray(mappings) || mappings.length === 0) return [];

  const setIds = new Set<string>();
  const groupIds = new Set<string>();
  const attrIds = new Set<string>();

  for (const m of mappings) {
    const setId = coerceToObjectId(m?.set);
    if (setId) setIds.add(setId.toString());
    for (const g of m?.groups ?? []) {
      const groupId = coerceToObjectId(g?.group);
      if (groupId) groupIds.add(groupId.toString());
      for (const a of g?.attributes ?? []) {
        const attrId = coerceToObjectId(a?.attribute);
        if (attrId) attrIds.add(attrId.toString());
      }
    }
  }

  const [sets, groups, attributes] = await Promise.all([
    setIds.size
      ? AttributeSet.find({
          _id: { $in: [...setIds].map((s) => new mongoose.Types.ObjectId(s)) },
        }).lean()
      : Promise.resolve([] as any[]),
    groupIds.size
      ? AttributeGroup.find({
          _id: {
            $in: [...groupIds].map((s) => new mongoose.Types.ObjectId(s)),
          },
        }).lean()
      : Promise.resolve([] as any[]),
    attrIds.size
      ? Attribute.find({
          _id: { $in: [...attrIds].map((s) => new mongoose.Types.ObjectId(s)) },
        }).lean()
      : Promise.resolve([] as any[]),
  ]);

  const unitFamilyIdSet = new Set<string>();
  for (const a of attributes) {
    const ufId = coerceToObjectId((a as any).unitFamily);
    if (ufId) unitFamilyIdSet.add(ufId.toString());
    else if ((a as any).unitFamily) {
      console.warn(
        "[category_property] Ignoring corrupted unitFamily on attribute",
        (a as any)._id?.toString?.(),
        (a as any).unitFamily,
      );
    }
  }

  const unitFamilies = unitFamilyIdSet.size
    ? await UnitFamily.find({
        _id: {
          $in: [...unitFamilyIdSet].map((s) => new mongoose.Types.ObjectId(s)),
        },
      }).lean()
    : [];

  const setMap = new Map<string, any>();
  for (const s of sets) setMap.set((s as any)._id.toString(), s);

  const groupMap = new Map<string, any>();
  for (const g of groups) groupMap.set((g as any)._id.toString(), g);

  const attrMap = new Map<string, any>();
  for (const a of attributes) attrMap.set((a as any)._id.toString(), a);

  const unitFamilyMap = new Map<string, any>();
  for (const u of unitFamilies) unitFamilyMap.set((u as any)._id.toString(), u);

  const result: AttributeSetResult[] = [];

  for (const mapping of mappings) {
    const setId = coerceToObjectId(mapping?.set);
    const set = setId ? setMap.get(setId.toString()) : null;
    if (!set) continue;

    const mappingGroupIds = (mapping.groups ?? [])
      .map((g) => coerceToObjectId(g?.group))
      .filter((id): id is mongoose.Types.ObjectId => id !== null)
      .map((id) => id.toString());

    if (mappingGroupIds.length === 0) continue;

    const mappingGroups = mappingGroupIds
      .map((id) => groupMap.get(id))
      .filter(Boolean);
    const groupAttrMap: Record<string, MappedAttribute[]> = {};

    for (const gm of mapping.groups ?? []) {
      const groupId = coerceToObjectId(gm?.group)?.toString();
      if (!groupId) continue;

      const selectedAttrs: MappedAttribute[] = [];
      for (const am of gm.attributes ?? []) {
        const attrId = coerceToObjectId(am?.attribute)?.toString();
        if (!attrId) continue;
        const attrDoc: any = attrMap.get(attrId);
        if (!attrDoc) continue;

        const flags = toFlags(am as any);
        const ufId = coerceToObjectId(attrDoc.unitFamily);
        const uf = ufId ? unitFamilyMap.get(ufId.toString()) : null;

        selectedAttrs.push({
          id: attrDoc._id.toString(),
          code: attrDoc.code,
          name: attrDoc.name,
          type: attrDoc.type,
          options: attrDoc.option || [],
          isRequired: flags.isRequired,
          isHighlight: flags.isHighlight,
          unitFamily: uf
            ? { id: uf._id.toString(), name: uf.name, baseUnit: uf.baseUnit }
            : null,
          sortOrder: attrDoc.sortOrder ?? 0,
        });
      }
      groupAttrMap[groupId] = selectedAttrs;
    }

    const buildTree = (
      parentId: string | null = null,
      visited: Set<string> = new Set(),
    ): GroupNode[] => {
      const parentKey = parentId ?? "__ROOT__";
      if (visited.has(parentKey)) return [];
      visited.add(parentKey);

      return mappingGroups
        .filter((g: any) => {
          const gParent = g.parentId?.toString() || null;
          if (parentId === null) return gParent === null;
          return gParent === parentId;
        })
        .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((g: any) => {
          const gId = g._id?.toString();
          return {
            id: gId,
            code: g.code,
            name: g.name,
            parentId: g.parentId?.toString() || null,
            sortOrder: g.sortOrder ?? 0,
            attributes: groupAttrMap[gId ?? ""] || [],
            children: buildTree(gId, new Set(visited)),
          };
        }) as any;
    };

    result.push({
      id: (set as any)._id.toString(),
      title: (set as any).title,
      code: (set as any).code,
      sortOrder: (set as any).sortOrder ?? 0,
      groups: buildTree(null),
    });
  }

  result.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return result;
}

/* ------------------- single-category attribute sets --------------------- */

/**
 * Resolve a category's effective attribute-set payload.
 *
 * Uses `inheritedProperty` when the category is inheriting from a parent,
 * otherwise falls back to its own `property`. Returns `[]` for any of:
 *   - invalid ID
 *   - category not found
 *   - no effective property assigned
 *   - property doc missing
 *
 * Used by `product.controller.ts` to compute required fields, variant
 * themes, and variant fields from the category's merged attribute sets.
 */
export async function getCategoryAttributeSets(
  categoryId: string,
): Promise<AttributeSetResult[]> {
  await connection();
  if (!mongoose.Types.ObjectId.isValid(categoryId)) return [];

  const category: any = await Category.findById(categoryId)
    .select("property inheritedProperty inheritProperty parentId")
    .lean();
  if (!category) return [];

  const isRoot = !category.parentId;
  const wantsInheritance = category.inheritProperty === true && !isRoot;

  const effectiveId =
    wantsInheritance && category.inheritedProperty
      ? category.inheritedProperty
      : category.property;
  if (!effectiveId) return [];

  const property: any = await CategoryProperty.findById(effectiveId).lean();
  if (!property) return [];

  return buildAttributeSetsFromMappings(property.mappings);
}
