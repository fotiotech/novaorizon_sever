import type { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import Attribute from "../models/Attribute.js";
import AttributeGroup from "../models/AttributeGroup.js";
import CategoryProperty from "../models/CategoryProperty.js";
import Category from "../models/Category.js";
import { connection } from "../config/db.js";
import { pruneEmptyMappings } from "../utils/category-inheritance.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import UnitFamily from "../models/UnitFamily.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function normalizeUnitFamilyId(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string")
    return mongoose.Types.ObjectId.isValid(value) ? value : null;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === "object" && value._id)
    return normalizeUnitFamilyId(value._id);
  return null;
}

/* ------------------------------- list ----------------------------------- */

export async function findAttributesAndValues(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const id = req.query.id as string | undefined;

  const query = id
    ? Attribute.findById(id)
    : Attribute.find().sort({ sortOrder: 1, name: 1 });

  const docs = await query.lean();
  const items = Array.isArray(docs) ? docs : docs ? [docs] : [];

  const validIds = Array.from(
    new Set(
      items
        .map((item: any) => normalizeUnitFamilyId(item.unitFamily))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const unitFamilies = validIds.length
    ? await UnitFamily.find({
        _id: { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select("_id name baseUnit")
        .lean()
    : [];

  const unitFamilyMap = new Map(
    (unitFamilies as any[]).map((u) => [u._id.toString(), u]),
  );

  const response = items.map((item: any) => {
    const normalizedItem = { ...item };
    const ufId = normalizeUnitFamilyId(normalizedItem.unitFamily);
    normalizedItem.unitFamily = ufId ? (unitFamilyMap.get(ufId) ?? null) : null;
    return normalizedItem;
  });

  if (id) {
    if (response.length === 0) throw new AppError("Attribute not found", 404);
    res.json({ data: response[0] });
    return;
  }
  res.json({ data: response });
}

/* ------------------------------- create --------------------------------- */

interface AttributeFormData {
  codes: string[];
  unitFamilies: string[];
  names: string[];
  sort_orders: number[];
  option?: string[][];
  type: string[];
}

export async function createAttribute(
  req: Request,
  res: Response,
): Promise<void> {
  const formData = (req.body ?? {}) as AttributeFormData;
  const { codes, unitFamilies, names, sort_orders, option, type } = formData;

  if (!Array.isArray(names) || names.length === 0) {
    throw new ValidationError({ names: ["Missing required fields"] });
  }
  await connection();

  const attributes = [];
  const len = Math.max(codes.length, names.length);

  for (let i = 0; i < len; i++) {
    const rawCode = (codes[i] || "").trim();
    const rawName = (names[i] || "").trim();
    let unitFamilyId = null;
    if (unitFamilies[i] && unitFamilies[i].trim().length > 0) {
      unitFamilyId = new Types.ObjectId(unitFamilies[i].trim());
    }
    if (!rawCode)
      throw new ValidationError({
        [`codes[${i}]`]: ["Invalid attribute code"],
      });
    if (!rawName)
      throw new ValidationError({
        [`names[${i}]`]: ["Invalid attribute name"],
      });

    const optionsArr = (option?.[i] || []).map((o) => o.trim()).filter(Boolean);
    const attrType = (type[i] || "text").trim();
    const attrSortOrder = sort_orders[i] || 0;

    const attribute = await Attribute.findOneAndUpdate(
      { code: rawCode },
      {
        $set: {
          name: rawName,
          unitFamily: unitFamilyId,
          option: optionsArr,
          type: attrType,
          sortOrder: attrSortOrder,
        },
      },
      { upsert: true, new: true },
    );
    attributes.push(attribute);
  }

  res.status(201).json({ success: true, data: attributes });
}

/* ------------------------------- update --------------------------------- */

interface AttributeUpdateParams {
  code: string;
  unitFamily: string;
  name: string;
  sort_order: number;
  option?: string[];
  type: string;
}

export async function updateAttribute(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid attribute ID"] });
  }
  await connection();

  const params = (req.body ?? {}) as AttributeUpdateParams;

  let optionsArr: string[] = [];
  if (params.option !== undefined) {
    optionsArr = params.option.map((o) => o.trim()).filter(Boolean);
  }

  let unitFamilyId = null;
  if (params.unitFamily && params.unitFamily.trim().length > 0) {
    unitFamilyId = new Types.ObjectId(params.unitFamily.trim());
  }

  const updateData = {
    code: params.code.trim(),
    unitFamily: unitFamilyId,
    name: params.name.trim(),
    option: optionsArr,
    type: params.type.trim(),
    // NOTE (preserved bug): original writes `sort_order` but the schema field
    // is `sortOrder` — this update is silently ignored. Fix by renaming to
    // `sortOrder: params.sort_order` and dropping the `sort_order` key.
    sort_order: params.sort_order,
  };

  const updated = await Attribute.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true },
  );
  if (!updated) throw new AppError("Attribute not found", 404);

  res.json({ success: true, data: updated });
}

/* ------------------------------- delete --------------------------------- */

export async function deleteAttribute(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid attribute ID"] });
  }
  await connection();

  const changedPropertyIds = new Set<string>();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // NOTE (preserved bug): AttributeGroup schema has no `attributes` field,
      // so this updateMany is a no-op. Kept for parity with the original.
      await AttributeGroup.updateMany(
        {},
        { $pull: { attributes: new mongoose.Types.ObjectId(id) } as any },
        { session },
      );

      const categoryProperties = await CategoryProperty.find({})
        .lean()
        .session(session);

      for (const property of categoryProperties) {
        if (!property.mappings) continue;
        let changed = false;
        const newMappings = property.mappings.map((mapping: any) => ({
          ...mapping,
          groups: (mapping.groups || []).map((group: any) => ({
            ...group,
            attributes: (group.attributes || []).filter((entry: any) => {
              const attrId = entry.attribute?.toString?.() ?? entry.attribute;
              const keep = attrId !== id;
              if (!keep) changed = true;
              return keep;
            }),
          })),
        }));

        if (changed) {
          changedPropertyIds.add(String(property._id));
          await CategoryProperty.findByIdAndUpdate(
            property._id,
            { $set: { mappings: pruneEmptyMappings(newMappings) } },
            { session },
          );
        }
      }

      const deleted = await Attribute.findByIdAndDelete(id).session(session);
      if (!deleted) throw new AppError("Attribute not found", 404);
    });

    
    res.json({ success: true });
  } catch (error) {
    console.error("[deleteAttribute]", error);
    throw error instanceof AppError
      ? error
      : new AppError("Failed to delete attribute", 500);
  } finally {
    await session.endSession();
  }
}

/* ---------------------------- usage map --------------------------------- */

export async function getAttributesUsageMap(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const [properties, categories, groups] = await Promise.all([
    CategoryProperty.find({}).select("_id mappings").lean(),
    Category.find({}).select("_id name property").lean(),
    AttributeGroup.find({}).select("_id name code").lean(),
  ]);

  const groupMeta = new Map<
    string,
    { _id: string; name: string; code?: string }
  >();
  for (const g of groups as any[]) {
    const gid = g._id.toString();
    groupMeta.set(gid, { _id: gid, name: g.name, code: g.code });
  }

  const attrInfo = new Map<
    string,
    { groupIds: Set<string>; propertyIds: Set<string> }
  >();
  const ensure = (aid: string) => {
    let v = attrInfo.get(aid);
    if (!v) {
      v = { groupIds: new Set(), propertyIds: new Set() };
      attrInfo.set(aid, v);
    }
    return v;
  };

  for (const p of properties as any[]) {
    const pid = p._id.toString();
    const mappings: any[] = Array.isArray(p.mappings) ? p.mappings : [];
    for (const m of mappings) {
      const groupEntries: any[] = Array.isArray(m?.groups) ? m.groups : [];
      for (const g of groupEntries) {
        const gid =
          g?.group?.toString?.() ??
          (typeof g?.group === "string" ? g.group : undefined);
        if (!gid) continue;
        const attrEntries: any[] = Array.isArray(g?.attributes)
          ? g.attributes
          : [];
        for (const a of attrEntries) {
          const aid =
            a?.attribute?.toString?.() ??
            (typeof a?.attribute === "string" ? a.attribute : undefined) ??
            a?.toString?.();
          if (!aid) continue;
          const info = ensure(aid);
          info.groupIds.add(gid);
          info.propertyIds.add(pid);
        }
      }
    }
  }

  const catsByProp = new Map<string, Array<{ _id: string; name: string }>>();
  for (const c of categories as any[]) {
    const cid = c._id.toString();
    const entry = { _id: cid, name: String(c.name ?? "") };
    const add = (pid: any) => {
      if (!pid) return;
      const key = pid.toString();
      if (!catsByProp.has(key)) catsByProp.set(key, []);
      const arr = catsByProp.get(key)!;
      if (!arr.some((x) => x._id === cid)) arr.push(entry);
    };
    add(c.property);
  }

  const result: Record<
    string,
    {
      categories: Array<{ _id: string; name: string }>;
      groups: Array<{ _id: string; name: string; code?: string }>;
    }
  > = {};

  for (const [aid, info] of attrInfo) {
    const groupList: Array<{ _id: string; name: string; code?: string }> = [];
    for (const gid of info.groupIds) {
      const meta = groupMeta.get(gid);
      if (meta) groupList.push(meta);
    }
    const catMap = new Map<string, { _id: string; name: string }>();
    for (const pid of info.propertyIds) {
      for (const cat of catsByProp.get(pid) ?? []) {
        if (!catMap.has(cat._id)) catMap.set(cat._id, cat);
      }
    }
    result[aid] = {
      categories: Array.from(catMap.values()),
      groups: groupList,
    };
  }

  res.json({ data: result });
}