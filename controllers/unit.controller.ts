import type { Request, Response } from "express";
import mongoose from "mongoose";
import Unit from "../models/Unit.js";
import UnitFamily from "../models/UnitFamily.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function createUnit(req: Request, res: Response): Promise<void> {
  await connection();
  const body = req.body ?? {};

  const unitData = {
    name: body.name,
    symbol: body.symbol,
    unitFamily: body.unitFamily,
    conversionFactor:
      typeof body.conversionFactor === "number"
        ? body.conversionFactor
        : parseFloat(String(body.conversionFactor ?? "1")),
    isBaseUnit: body.isBaseUnit === true || body.isBaseUnit === "true",
  };

  if (!unitData.name || !unitData.symbol || !unitData.unitFamily) {
    throw new ValidationError({
      name: unitData.name ? undefined : ["name required"],
      symbol: unitData.symbol ? undefined : ["symbol required"],
      unitFamily: unitData.unitFamily ? undefined : ["unitFamily required"],
    });
  }

  if (!mongoose.Types.ObjectId.isValid(String(unitData.unitFamily))) {
    throw new ValidationError({ unitFamily: ["Invalid unit family ID"] });
  }
  const familyExists = await UnitFamily.exists({ _id: unitData.unitFamily });
  if (!familyExists) {
    throw new AppError("Unit family not found", 404);
  }

  const unit = new Unit(unitData);
  await unit.save();

  res.status(201).json({ success: true, message: "Unit created successfully" });
}

export async function updateUnit(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid unit ID"] });
  }
  await connection();
  const body = req.body ?? {};

  const updateData: Record<string, any> = {
    name: body.name,
    symbol: body.symbol,
    conversionFactor:
      typeof body.conversionFactor === "number"
        ? body.conversionFactor
        : parseFloat(String(body.conversionFactor ?? "1")),
    isBaseUnit: body.isBaseUnit === true || body.isBaseUnit === "true",
  };

  // ✅ FIX: persist `unitFamily` when explicitly provided.
  // Leaving the field `undefined` keeps the current value (partial-update safe).
  if (body.unitFamily !== undefined) {
    if (!body.unitFamily || String(body.unitFamily).trim() === "") {
      throw new ValidationError({ unitFamily: ["unitFamily is required"] });
    }
    if (!mongoose.Types.ObjectId.isValid(String(body.unitFamily))) {
      throw new ValidationError({ unitFamily: ["Invalid unit family ID"] });
    }
    const familyExists = await UnitFamily.exists({ _id: body.unitFamily });
    if (!familyExists) {
      throw new AppError("Unit family not found", 404);
    }
    updateData.unitFamily = new mongoose.Types.ObjectId(
      String(body.unitFamily),
    );
  }

  const updated = await Unit.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new AppError("Unit not found", 404);

  res.json({ success: true, message: "Unit updated successfully" });
}

export async function deleteUnit(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid unit ID"] });
  }
  await connection();
  const deleted = await Unit.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Unit not found", 404);
  res.json({ success: true, message: "Unit deleted successfully" });
}

export async function getUnits(req: Request, res: Response): Promise<void> {
  await connection();
  const unitFamilyId = req.query.unitFamilyId as string | undefined;
  const query = unitFamilyId ? { unitFamily: unitFamilyId } : {};
  const units = await Unit.find(query)
    .populate("unitFamily")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ data: units });
}
