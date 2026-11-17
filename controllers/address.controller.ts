import type { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import Address from "../models/Address.js";
import { PaymentMethod } from "../models/PaymentMethod.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

const addressSchema = z.object({
  label: z.string().min(1, "Label is required"),
  street: z.string().min(1, "Street is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().optional(),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().default("Cameroon"),
  isDefault: z.boolean().default(false),
});

function toObjectIdOrThrow(id: string, field = "id"): Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ [field]: [`Invalid ${field}`] });
  }
  return new Types.ObjectId(id);
}

/* ------------------------------- CREATE --------------------------------- */

export async function createAddress(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const parsed = addressSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors as any);
  }

  await connection();

  const address = new Address({
    ...parsed.data,
    userId: new Types.ObjectId(userId),
  });
  await address.save();

  res.status(201).json({ success: true, data: address.toJSON() });
}

/* --------------------------------- LIST --------------------------------- */

export async function getUserAddresses(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  await connection();

  const addresses = await Address.find({ userId: new Types.ObjectId(userId) })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();

  res.json({ data: addresses });
}

/* ------------------------------- UPDATE --------------------------------- */

export async function updateAddress(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const addressId = param(req, "id");
  toObjectIdOrThrow(addressId);

  const parsed = addressSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors as any);
  }

  await connection();

  const updated = await Address.findOneAndUpdate(
    { _id: addressId, userId: new Types.ObjectId(userId) },
    { $set: parsed.data },
    { new: true, runValidators: true },
  );
  if (!updated) throw new AppError("Address not found or unauthorized", 404);

  res.json({ success: true, data: updated.toJSON() });
}

/* ------------------------------- DELETE --------------------------------- */

export async function deleteAddress(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const addressId = param(req, "id");
  toObjectIdOrThrow(addressId);

  await connection();

  // Block deletion if a credit card still references this address.
  const linkedCard = await PaymentMethod.findOne({
    userId: new Types.ObjectId(userId),
    methodType: "CreditCard",
    "details.billingAddressId": new Types.ObjectId(addressId),
  });

  if (linkedCard) {
    throw new AppError(
      "Cannot delete this address because it is linked to an existing credit card. Remove the card first.",
      409,
    );
  }

  const result = await Address.findOneAndDelete({
    _id: addressId,
    userId: new Types.ObjectId(userId),
  });
  if (!result) throw new AppError("Address not found or unauthorized", 404);

  res.json({ success: true, message: "Address deleted successfully" });
}

/* --------------------------- SET AS DEFAULT ----------------------------- */

export async function setDefaultAddress(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const addressId = param(req, "id");
  toObjectIdOrThrow(addressId);

  await connection();

  const address = await Address.findOne({
    _id: addressId,
    userId: new Types.ObjectId(userId),
  });
  if (!address) throw new AppError("Address not found or unauthorized", 404);

  // pre-save hook clears any other default for this user.
  address.isDefault = true;
  await address.save();

  res.json({ success: true, data: address.toJSON() });
}
