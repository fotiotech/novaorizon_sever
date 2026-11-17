import type { Request, Response } from "express";
import mongoose from "mongoose";
import Carrier from "../models/Carrier.js";
import Product from "../models/Product.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function toObjectIdOrThrow(id: string, field = "id"): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ [field]: [`Invalid ${field}`] });
  }
  return new mongoose.Types.ObjectId(id);
}

function sanitizeRegions(raw: any): any[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    if (!r || typeof r !== "object")
      throw new ValidationError({ regionsServed: ["Invalid region"] });
    if (!r.region)
      throw new ValidationError({
        regionsServed: ["region required for each region"],
      });
    if (!r.averageDeliveryTime)
      throw new ValidationError({
        regionsServed: ["averageDeliveryTime required"],
      });
    const basePrice =
      typeof r.basePrice === "number"
        ? r.basePrice
        : parseFloat(String(r.basePrice));
    if (!Number.isFinite(basePrice))
      throw new ValidationError({
        regionsServed: ["basePrice must be a number"],
      });
    return {
      region: String(r.region),
      basePrice,
      averageDeliveryTime: String(r.averageDeliveryTime),
    };
  });
}

/* ------------------------------- CREATE --------------------------------- */

export async function createCarrier(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body ?? {};
  const name = String(body.name ?? "").trim();
  const contact = String(body.contact ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!name || !contact || !email) {
    throw new ValidationError({
      name: name ? undefined : ["name required"],
      contact: contact ? undefined : ["contact required"],
      email: email ? undefined : ["email required"],
    });
  }

  const costWeight =
    typeof body.costWeight === "number"
      ? body.costWeight
      : parseFloat(String(body.costWeight));
  if (!Number.isFinite(costWeight))
    throw new ValidationError({ costWeight: ["Must be a number"] });

  const regionsServed = sanitizeRegions(body.regionsServed);

  await connection();
  const carrier = new Carrier({
    name,
    contact,
    email,
    regionsServed,
    costWeight,
  });
  await carrier.save();

  res.status(201).json({ success: true, data: carrier.toJSON() });
}

/* -------------------------------- LIST ---------------------------------- */

export async function getCarriers(_req: Request, res: Response): Promise<void> {
  await connection();
  const carriers = await Carrier.find().lean();
  res.json({
    data: carriers.map((c: any) => ({
      ...c,
      _id: c._id.toString(),
    })),
  });
}

export async function getCarrierById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);
  await connection();
  const carrier = await Carrier.findById(id).lean();
  if (!carrier) throw new AppError("Carrier not found", 404);
  res.json({ data: { ...carrier, _id: (carrier as any)._id.toString() } });
}

/* ------------------------------- UPDATE --------------------------------- */

export async function updateCarrier(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);
  await connection();

  const body = req.body ?? {};
  const update: Record<string, any> = {};
  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.contact !== undefined) update.contact = String(body.contact).trim();
  if (body.email !== undefined) update.email = String(body.email).trim();
  if (body.costWeight !== undefined) {
    const cw =
      typeof body.costWeight === "number"
        ? body.costWeight
        : parseFloat(String(body.costWeight));
    if (!Number.isFinite(cw))
      throw new ValidationError({ costWeight: ["Must be a number"] });
    update.costWeight = cw;
  }
  if (body.regionsServed !== undefined) {
    update.regionsServed = sanitizeRegions(body.regionsServed);
  }

  const updated = await Carrier.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!updated) throw new AppError("Carrier not found", 404);
  res.json({ success: true, data: updated.toJSON() });
}

/* ------------------------------- DELETE --------------------------------- */

export async function deleteCarrier(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);
  await connection();

  await Product.updateMany({ carrier: id }, { $unset: { carrier: "" } });
  const deleted = await Carrier.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Carrier not found", 404);
  res.json({ success: true, message: "Carrier deleted" });
}

/* ------------------------ CALCULATE SHIPPING ---------------------------- */

export async function calculateShippingPrice(
  req: Request,
  res: Response,
): Promise<void> {
  const { carrierId, region, weight } = req.body ?? {};
  if (!carrierId || typeof carrierId !== "string") {
    throw new ValidationError({ carrierId: ["carrierId required"] });
  }
  if (!region || typeof region !== "string") {
    throw new ValidationError({ region: ["region required"] });
  }
  toObjectIdOrThrow(carrierId, "carrierId");

  await connection();
  const carrier = await Carrier.findById(carrierId);
  if (!carrier) throw new AppError("Carrier not found", 404);

  const regionDetails: any = carrier.regionsServed.find(
    (r: any) => r.region.toLowerCase() === region.toLowerCase(),
  );
  if (!regionDetails) {
    throw new AppError(`Region ${region} is not served by this carrier`, 404);
  }

  const basePrice = regionDetails.basePrice;
  const costWeight = carrier.costWeight || 0;
  const w = Number(weight) || 0;
  const shippingPrice = basePrice + w * costWeight;

  res.json({
    data: {
      ...(regionDetails.toObject?.() ?? regionDetails),
      _id: regionDetails._id?.toString(),
      shippingPrice,
    },
  });
}
