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
  isVariant: boolean;
  isVariantAttribute: boolean;
}

function toFlags(
  input: Partial<AttributeFlags> | undefined | null,
): AttributeFlags {
  return {
    isRequired: input?.isRequired === true,
    isHighlight: input?.isHighlight === true,
    isVariant: input?.isVariant === true,
    isVariantAttribute: input?.isVariantAttribute === true,
  };
}

export function mapInputMappings(
  mappings: {
    set: string;
    groups: {
      group: string;
      attributes: {
        attribute: string;
        isRequired?: boolean;
        isHighlight?: boolean;
        isVariant?: boolean;
        isVariantAttribute?: boolean;
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

export function normalizeMappings(mappings: any[]): any[] {
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
                isVariant: a?.isVariant === true,
                isVariantAttribute: a?.isVariantAttribute === true,
              }))
            : [],
        }))
      : [],
  }));
}

export function mergeMappingsWithPrecedence(layers: any[][]): any[] {
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
          isVariant: flags.isVariant,
          isVariantAttribute: flags.isVariantAttribute,
        }),
      ),
    })),
  }));
}

/**
 * Removes groups with no attributes and set-mappings with no groups.
 *
 * Deletions in the attribute library used to leave these empty shells behind,
 * which made the property editor and the category viewer report stale counts
 * ("2 sets", "1 selected") for attributes that no longer existed.
 */
export function pruneEmptyMappings(mappings: any[]): any[] {
  if (!Array.isArray(mappings)) return [];
  return mappings
    .map((mapping) => ({
      ...mapping,
      groups: (mapping?.groups ?? []).filter(
        (group: any) => (group?.attributes ?? []).length > 0,
      ),
    }))
    .filter((mapping) => (mapping?.groups ?? []).length > 0);
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

/**
 * Effective mappings for a category, computed from the ancestor chain on
 * demand. Snapshots are a cache and are no longer read here — a stale snapshot
 * can never influence the result.
 */
export async function resolveEffectiveMappings(
  categoryId: string,
  cache?: Map<string, any[]>,
): Promise<any[]> {
  await connection();
  if (!mongoose.Types.ObjectId.isValid(categoryId)) return [];

  const cached = cache?.get(categoryId);
  if (cached) return cached;

  const category: any = await Category.findById(categoryId)
    .select("property inheritProperty parentId")
    .lean();
  if (!category) return [];

  let ownMappings: any[] = [];
  if (category.property) {
    const ownProp: any = await CategoryProperty.findById(category.property)
      .select("mappings")
      .lean();
    if (ownProp?.mappings) ownMappings = normalizeMappings(ownProp.mappings);
  }

  let ancestorMappings: any[] = [];
  if (category.inheritProperty === true && category.parentId) {
    const ancestors = await collectAncestorProperties(categoryId);
    ancestorMappings = ancestors.mappings;
  }

  const merged = pruneEmptyMappings(
    mergeMappingsWithPrecedence([ancestorMappings, ownMappings]),
  );
  cache?.set(categoryId, merged);
  return merged;
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
  isVariant: boolean;
  isVariantAttribute: boolean;
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
        isVariant?: boolean;
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
          isVariant: flags.isVariant,
          isVariantAttribute: flags.isVariantAttribute,
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
          const gId = g._id?.toString() ?? "";
          // Skip groups with no attributes left (e.g. after a deletion).
          if ((groupAttrMap[gId] ?? []).length === 0) return false;
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
 * Merges the ancestor chain when the category inherits, then falls back to the
 * category's own `property`. Returns `[]` for any of:
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
  cache?: Map<string, any[]>,
): Promise<AttributeSetResult[]> {
  await connection();
  if (!mongoose.Types.ObjectId.isValid(categoryId)) return [];

  // Resolve from the ancestor chain (never from the persisted snapshot).
  const mappings = await resolveEffectiveMappings(categoryId, cache);
  if (mappings.length === 0) return [];

  return buildAttributeSetsFromMappings(mappings);
}