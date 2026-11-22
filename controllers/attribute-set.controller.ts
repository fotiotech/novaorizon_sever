import type { Request, Response } from "express";
import mongoose from "mongoose";
import AttributeSet from "../models/AttributeSet.js";
import CategoryProperty from "../models/CategoryProperty.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { toPlain } from "../utils/toPlain.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function createAttributeSet(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const data = req.body ?? {};

  const title = String(data.title ?? "").trim();
  const code = String(data.code ?? "").trim();

  if (!title) throw new ValidationError({ title: ["Title is required"] });
  if (!code) throw new ValidationError({ code: ["Code is required"] });

  const existing = await AttributeSet.findOne({ code });
  if (existing) throw new AppError(`Code "${code}" already exists`, 409);

  const attributeSet = new AttributeSet({
    title,
    code,
    description: data.description ? String(data.description).trim() : null,
    sortOrder: data.sortOrder ?? 0,
  });
  await attributeSet.save();

  res
    .status(201)
    .json({ success: true, data: toPlain(attributeSet.toObject()) });
}

export async function getAttributeSets(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const sets = await AttributeSet.find().sort({ sortOrder: 1 }).lean();
  res.json({ data: toPlain(sets) });
}

export async function getAttributeSet(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid attribute set ID"] });
  }
  await connection();
  const set = await AttributeSet.findById(id).lean();
  if (!set) throw new AppError("Attribute set not found", 404);
  res.json({ data: toPlain(set) });
}

export async function updateAttributeSet(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid attribute set ID"] });
  }
  await connection();

  const data = req.body ?? {};
  const title = String(data.title ?? "").trim();
  const code = String(data.code ?? "").trim();
  if (!title) throw new ValidationError({ title: ["Title is required"] });
  if (!code) throw new ValidationError({ code: ["Code is required"] });

  const existing = await AttributeSet.findOne({ code, _id: { $ne: id } });
  if (existing) throw new AppError(`Code "${code}" already exists`, 409);

  const updated = await AttributeSet.findByIdAndUpdate(
    id,
    {
      title,
      code,
      description: data.description ?? null,
      sortOrder: data.sortOrder,
    },
    { new: true },
  );
  if (!updated) throw new AppError("Attribute set not found", 404);

  res.json({ success: true, data: toPlain(updated.toObject()) });
}

export async function deleteAttributeSet(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid attribute set ID"] });
  }
  await connection();

  const setObjectId = new mongoose.Types.ObjectId(id);

  await CategoryProperty.updateMany(
    { "mappings.set": setObjectId },
    { $pull: { mappings: { set: setObjectId } } },
  );

  const deleted = await AttributeSet.findByIdAndDelete(setObjectId);
  if (!deleted) throw new AppError("Attribute set not found", 404);

  
  res.json({ success: true });
}