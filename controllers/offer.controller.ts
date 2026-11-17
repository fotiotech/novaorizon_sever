import type { Request, Response } from "express";
import mongoose from "mongoose";
import Offer from "../models/Offer.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function createOffer(req: Request, res: Response): Promise<void> {
  await connection();
  const { name, description, type, discountValue, conditions, isActive } =
    req.body ?? {};

  if (!name || !type) {
    throw new ValidationError({
      name: name ? undefined : ["name required"],
      type: type ? undefined : ["type required"],
    });
  }
  if (!conditions?.startDate || !conditions?.endDate) {
    throw new ValidationError({
      conditions: ["startDate and endDate are required"],
    });
  }

  const offer = await Offer.create({
    name,
    description,
    type,
    discountValue,
    conditions,
    isActive: isActive !== false,
  });
  res.status(201).json({ success: true, data: offer.toObject() });
}

export async function readOffers(req: Request, res: Response): Promise<void> {
  await connection();
  const id = req.query.id as string | undefined;

  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError({ id: ["Invalid offer ID"] });
    }
    const offer = await Offer.findById(id).lean();
    if (!offer) throw new AppError("Offer not found", 404);
    res.json({ data: offer });
    return;
  }

  const offers = await Offer.find().lean();
  res.json({ data: offers });
}

export async function updateOffer(req: Request, res: Response): Promise<void> {
  await connection();
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid offer ID"] });
  }

  const updated = await Offer.findByIdAndUpdate(id, req.body ?? {}, {
    new: true,
  });
  if (!updated) throw new AppError("Offer not found", 404);
  res.json({ success: true, data: updated.toObject() });
}

export async function deleteOffer(req: Request, res: Response): Promise<void> {
  await connection();
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid offer ID"] });
  }

  const deleted = await Offer.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Offer not found", 404);
  res.json({ success: true });
}
