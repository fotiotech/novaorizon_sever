import type { Request, Response } from "express";
import mongoose from "mongoose";
import AttributeGroup from "../models/AttributeGroup.js";
import CategoryProperty from "../models/CategoryProperty.js";
import Category from "../models/Category.js";
import { connection } from "../config/db.js";
import { pruneEmptyMappings } from "../utils/category-inheritance.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export interface Group {
  _id: string;
  code: string;
  name: string;
  parentId: string;
  createdAt?: Date;
  sortOrder: number;
  children?: Group[];
}

function serializeGroup(group: any): Group {
  return {
    _id: group._id.toString(),
    code: group.code,
    name: group.name,
    parentId: group.parentId ? group.parentId.toString() : "",
    createdAt: group.createdAt ? new Date(group.createdAt) : undefined,
    sortOrder: group.sortOrder,
  };
}

function buildTree(flatGroups: Group[]): Group[] {
  const map: Record<string, Group & { children: Group[] }> = {};
  flatGroups.forEach((g) => (map[g._id] = { ...g, children: [] }));

  const roots: (Group & { children: Group[] })[] = [];
  flatGroups.forEach((g) => {
    if (g.parentId) {
      const parent = map[g.parentId];
      if (parent) parent.children!.push(map[g._id]);
    } else {
      roots.push(map[g._id]);
    }
  });

  const sortTree = (nodes: Group[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    nodes.forEach((n) => {
      if (n.children?.length) sortTree(n.children);
    });
  };
  sortTree(roots);
  return roots;
}

export async function findAllAttributeGroups(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const id = req.query.id as string | undefined;
  const filter = id ? { _id: new mongoose.Types.ObjectId(id) } : {};
  const groups = await AttributeGroup.find(filter).lean<any>();

  const populated = groups.map((group: any) => ({
    _id: group._id.toString(),
    code: group.code,
    name: group.name,
    parentId: group.parentId ? group.parentId.toString() : "",
    createdAt: group.createdAt,
    sortOrder: group.sortOrder,
  }));

  res.json({ data: buildTree(populated) });
}

export async function createAttributeGroup(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const { name, code, parentId, sortOrder } = req.body ?? {};
  if (!name || !code) {
    throw new ValidationError({
      name: name ? undefined : ["Name is required"],
      code: code ? undefined : ["Code is required"],
    });
  }

  const newGroup = await AttributeGroup.findOneAndUpdate(
    { name },
    {
      code,
      name,
      parentId: parentId ? parentId : undefined,
      sortOrder: sortOrder ?? 0,
    },
    { upsert: true, new: true, lean: true },
  );

  if (!newGroup) throw new AppError("Failed to create group", 500);
  res.status(201).json({ data: serializeGroup(newGroup) });
}

export async function findGroup(req: Request, res: Response): Promise<void> {
  await connection();
  const id = req.query.id as string | undefined;

  const buildGroupTreeWithValues = (
    groups: any[],
    parentId: string | null = null,
  ): any[] => {
    return groups
      .filter(
        (group) =>
          (!parentId && !group.parentId) ||
          (parentId && group.parentId?.toString() === parentId),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((group) => ({
        _id: group._id?.toString(),
        code: group.code,
        name: group.name,
        parentId: group.parentId?.toString(),
        sortOrder: group.sortOrder,
        children: buildGroupTreeWithValues(groups, group?._id?.toString()),
      }));
  };

  const groups = await AttributeGroup.find({})
    .sort({ sortOrder: 1 })
    .lean()
    .exec();
  if (!groups || groups.length === 0) {
    res.json({ data: [] });
    return;
  }

  if (id) {
    const tree = buildGroupTreeWithValues(groups);
    const findInTree = (nodes: any[], targetId: string): any => {
      for (const node of nodes) {
        if (node._id === targetId) return node;
        const found = findInTree(node.children || [], targetId);
        if (found) return found;
      }
      return null;
    };
    const groupNode = findInTree(tree, id);
    if (!groupNode) throw new AppError("Group not found", 404);
    res.json({ data: groupNode });
    return;
  }

  res.json({ data: buildGroupTreeWithValues(groups) });
}

export async function updateAttributeGroup(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid group ID"] });
  }
  await connection();

  const updates = req.body ?? {};
  const updateData: any = { ...updates };
  if (updates.parentId !== undefined) {
    updateData.parentId = updates.parentId
      ? new mongoose.Types.ObjectId(updates.parentId)
      : null;
  }

  const updated = await AttributeGroup.findByIdAndUpdate(id, updateData, {
    new: true,
  }).lean();
  if (!updated) throw new AppError("Group not found", 404);

  res.json({ data: serializeGroup(updated) });
}

export async function deleteAttributeGroup(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid group ID"] });
  }
  await connection();

  const groupObjectId = new mongoose.Types.ObjectId(id);

  await AttributeGroup.updateMany(
    { parentId: groupObjectId },
    { $set: { parentId: null } },
  );

  const categoryProperties = await CategoryProperty.find({});
  const changedPropertyIds: string[] = [];
  for (const property of categoryProperties) {
    let changed = false;
    property.mappings = (property.mappings || []).map((mapping: any) => ({
      ...mapping,
      groups: (mapping.groups || []).filter((group: any) => {
        const matches = group.group?.toString?.() === id;
        if (matches) changed = true;
        return !matches;
      }),
    }));
    if (changed) {
      property.mappings = pruneEmptyMappings(property.mappings);
      await property.save();
      changedPropertyIds.push(String(property._id));
    }
  }

  await AttributeGroup.findByIdAndDelete(groupObjectId);
    res.json({ success: true });
}

export async function getAttributeGroupsUsageMap(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const [properties, categories] = await Promise.all([
    CategoryProperty.find({}).select("_id mappings").lean(),
    Category.find({}).select("_id name property").lean(),
  ]);

  const groupToProps = new Map<string, Set<string>>();
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
        if (!groupToProps.has(gid)) groupToProps.set(gid, new Set());
        groupToProps.get(gid)!.add(pid);
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
    { categories: Array<{ _id: string; name: string }> }
  > = {};
  for (const [gid, pids] of groupToProps) {
    const catMap = new Map<string, { _id: string; name: string }>();
    for (const pid of pids) {
      for (const cat of catsByProp.get(pid) ?? []) {
        if (!catMap.has(cat._id)) catMap.set(cat._id, cat);
      }
    }
    result[gid] = { categories: Array.from(catMap.values()) };
  }

  res.json({ data: result });
}