import type { Request, Response } from "express";
import mongoose from "mongoose";
import CategoryProperty from "../models/CategoryProperty.js";
import AttributeSet from "../models/AttributeSet.js";
import AttributeGroup from "../models/AttributeGroup.js";
import Attribute from "../models/Attribute.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { pruneDescendantsAfterPropertyUpdate } from "../utils/category-inheritance.js";
import { toPlain } from "../utils/toPlain.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

interface MappingInput {
  set: string;
  groups: {
    group: string;
    attributes: {
      attribute: string;
      isRequired?: boolean;
      isHighlight?: boolean;
    }[];
  }[];
}

function toFlags(
  input:
    | Partial<{ isRequired: boolean; isHighlight: boolean }>
    | undefined
    | null,
) {
  return {
    isRequired: input?.isRequired === true,
    isHighlight: input?.isHighlight === true,
  };
}

function mapInputMappings(mappings: MappingInput[]) {
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

export async function getCategoryProperty(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const id = req.query.id as string | undefined;
  const includeReadOnly = req.query.includeReadOnly === "true";

  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError({ id: ["Invalid property ID"] });
    }
    const property = await CategoryProperty.findById(id).lean();
    if (!property) throw new AppError("Category property not found", 404);
    res.json({ data: toPlain(property) });
    return;
  }

  const filter = includeReadOnly ? {} : { readOnly: { $ne: true } };
  const properties = await CategoryProperty.find(filter).lean();
  res.json({ data: toPlain(properties) });
}

export async function createCategoryPropertyWithMappings(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const { code, name, description, mappings } = req.body ?? {};
  if (!code || !name || !Array.isArray(mappings)) {
    throw new ValidationError({
      code: code ? undefined : ["Code is required"],
      name: name ? undefined : ["Name is required"],
      mappings: Array.isArray(mappings)
        ? undefined
        : ["Mappings must be an array"],
    });
  }

  const duplicate = await CategoryProperty.findOne({ code });
  if (duplicate) throw new AppError(`Code "${code}" is already in use.`, 409);

  for (const m of mappings as MappingInput[]) {
    if (!(await AttributeSet.findById(m.set)))
      throw new AppError(`Set ${m.set} not found`, 400);
    for (const g of m.groups) {
      if (!(await AttributeGroup.findById(g.group)))
        throw new AppError(`Group ${g.group} not found`, 400);
      for (const a of g.attributes) {
        if (!(await Attribute.findById(a.attribute)))
          throw new AppError(`Attribute ${a.attribute} not found`, 400);
      }
    }
  }

  const prepared = mapInputMappings(mappings);
  const property = new CategoryProperty({
    code,
    name,
    description: description ?? null,
    readOnly: false,
    mappings: prepared as any,
  });
  await property.save();

  res.status(201).json({ success: true, data: toPlain(property.toObject()) });
}

export async function updateCategoryPropertyWithMappings(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid property ID"] });
  }
  await connection();

  const property = await CategoryProperty.findById(id);
  if (!property) throw new AppError("Category property not found", 404);

  if (property.readOnly) {
    throw new AppError(
      "This property is system-managed (inherited). It can only be regenerated via Re-run inheritance.",
      400,
    );
  }

  const data = req.body ?? {};

  if (data.code) {
    const existing = await CategoryProperty.findOne({ code: data.code });
    if (existing && existing._id.toString() !== id) {
      throw new AppError(
        `Code "${data.code}" is already used by another property.`,
        409,
      );
    }
    property.code = data.code;
  }
  if (data.name) property.name = data.name;
  if (data.description !== undefined) property.description = data.description;
  if (data.mappings) property.mappings = mapInputMappings(data.mappings) as any;

  await property.save();

  try {
    const { snapshotsUpdated } = await pruneDescendantsAfterPropertyUpdate(id);
    if (snapshotsUpdated > 0) {
      console.log(
        `[inheritance] Pruned ${snapshotsUpdated} descendant snapshots after property update.`,
      );
    }
  } catch (err) {
    console.error("[inheritance] Prune after property update failed:", err);
  }

  res.json({ success: true, data: toPlain(property.toObject()) });
}

export async function deleteCategoryProperty(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid property ID"] });
  }
  await connection();

  const property = await CategoryProperty.findById(id);
  if (!property) throw new AppError("Category property not found", 404);

  if (property.readOnly) {
    throw new AppError(
      "This property is system-managed (inherited) and cannot be deleted manually.",
      400,
    );
  }

  // Lazy import avoids a circular dependency at module load
  const { default: Category } = await import("../models/Category.js");
  const affected = await Category.find({ property: id }).select("_id").lean();

  await CategoryProperty.findByIdAndDelete(id);
  await Category.updateMany({ property: id }, { $unset: { property: "" } });

  const { pruneDescendantSnapshots } =
    await import("../utils/category-inheritance.js");
  let snapshotsUpdated = 0;
  for (const c of affected) {
    try {
      snapshotsUpdated += await pruneDescendantSnapshots(
        (c._id as any).toString(),
      );
    } catch (err) {
      console.error("[inheritance] Prune failed:", err);
    }
  }

  res.json({
    success: true,
    message: `Category property deleted. ${snapshotsUpdated} descendant snapshot(s) pruned.`,
  });
}
