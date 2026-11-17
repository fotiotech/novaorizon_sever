import type { Request, Response } from "express";
import mongoose from "mongoose";
import UnitFamily from "../models/UnitFamily.js";
import Unit from "../models/Unit.js";
import Attribute from "../models/Attribute.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function createUnitFamily(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const { name, description, baseUnit } = req.body ?? {};
  if (!name || !baseUnit) {
    throw new ValidationError({
      name: name ? undefined : ["name required"],
      baseUnit: baseUnit ? undefined : ["baseUnit required"],
    });
  }

  try {
    const unitFamily = new UnitFamily({ name, description, baseUnit });
    await unitFamily.save();
  } catch (err: any) {
    if (err?.code === 11000) {
      throw new AppError(`A unit family named "${name}" already exists.`, 409);
    }
    throw err;
  }

  res
    .status(201)
    .json({ success: true, message: "Unit family created successfully" });
}

export async function updateUnitFamily(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid unit family ID"] });
  }
  await connection();
  const { name, description, baseUnit } = req.body ?? {};

  if (!name || !baseUnit) {
    throw new ValidationError({
      name: name ? undefined : ["name required"],
      baseUnit: baseUnit ? undefined : ["baseUnit required"],
    });
  }

  let updated;
  try {
    updated = await UnitFamily.findByIdAndUpdate(
      id,
      { name, description, baseUnit },
      { new: true, runValidators: true },
    );
  } catch (err: any) {
    if (err?.code === 11000) {
      throw new AppError(`A unit family named "${name}" already exists.`, 409);
    }
    throw err;
  }

  if (!updated) throw new AppError("Unit family not found", 404);
  res.json({ success: true, message: "Unit family updated successfully" });
}

export async function deleteUnitFamily(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid unit family ID"] });
  }
  await connection();

  const family = await UnitFamily.findById(id).select("_id");
  if (!family) throw new AppError("Unit family not found", 404);

  // Cascade: drop units in this family, nullify attribute refs.
  await Unit.deleteMany({ unitFamily: id });
  await Attribute.updateMany(
    { unitFamily: id },
    { $set: { unitFamily: null } },
  );
  await UnitFamily.findByIdAndDelete(id);

  res.json({ success: true, message: "Unit family deleted successfully" });
}

export async function getUnitFamilies(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const unitFamilies = await UnitFamily.find().sort({ createdAt: -1 });
  res.json({ data: JSON.parse(JSON.stringify(unitFamilies)) });
}
