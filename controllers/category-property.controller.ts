import type { Request, Response } from "express";
import mongoose from "mongoose";
import CategoryProperty from "../models/CategoryProperty.js";
import AttributeSet from "../models/AttributeSet.js";
import AttributeGroup from "../models/AttributeGroup.js";
import Attribute from "../models/Attribute.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { pruneEmptyMappings } from "../utils/category-inheritance.js";
import { toPlain } from "../utils/toPlain.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

interface FlagInput {
  isRequired?: boolean;
  isHighlight?: boolean;
  isVariant?: boolean;
  isVariantAttribute?: boolean;
}

function toFlags(input: FlagInput) {
  return {
    isRequired: input?.isRequired === true,
    isHighlight: input?.isHighlight === true,
    isVariant: input?.isVariant === true,
    isVariantAttribute: input?.isVariantAttribute === true,
  };
}

function mapInputMappings(mappings: any[]): any[] {
  return mappings.map((m) => ({
    set: new mongoose.Types.ObjectId(m.set),
    groups: m.groups.map((g: any) => ({
      group: new mongoose.Types.ObjectId(g.group),
      attributes: g.attributes.map((a: any) => ({
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

  for (const m of mappings) {
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

  const data = req.body ?? {};
  const updates: Record<string, any> = {};
  if (data.code) updates.code = data.code;
  if (data.name) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.mappings) {
    updates.mappings = pruneEmptyMappings(mapInputMappings(data.mappings));
  }

  const updated = await CategoryProperty.findOneAndUpdate(
    { _id: id, readOnly: { $ne: true } },
    { $set: updates },
    { returnDocument: "after", runValidators: true },
  ).catch((err: any) => {
    if (err?.code === 11000) {
      throw new AppError(`Code "${data.code}" is already used by another property.`, 409);
    }
    throw err;
  });

  if (!updated) {
    const existing = await CategoryProperty.findById(id).select("readOnly").lean();
    if (!existing) throw new AppError("Category property not found", 404);
    throw new AppError(
      "This property is system-managed (inherited). It is regenerated automatically when an ancestor changes.",
      400,
    );
  }

  res.json({ success: true, data: toPlain(updated.toObject()) });
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

  // Lazy import avoids a circular dependency at module load.
  const { default: Category } = await import("../models/Category.js");

  await CategoryProperty.findByIdAndDelete(id);
  await Category.updateMany({ property: id }, { $unset: { property: "" } });

  res.json({
    success: true,
    message: "Category property deleted.",
  });
}