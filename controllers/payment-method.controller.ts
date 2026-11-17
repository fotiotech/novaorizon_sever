import type { Request, Response } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import Address from "../models/Address.js";
import { PaymentMethod } from "../models/PaymentMethod.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

const paymentMethodSchema = z.discriminatedUnion("methodType", [
  z.object({
    methodType: z.literal("MobileMoney"),
    details: z.object({
      phoneNumber: z.string().min(9).max(13),
      provider: z.enum(["MTN", "Orange", "Camtel"]),
      reference: z.string().optional(),
    }),
  }),
  z.object({
    methodType: z.literal("PayPal"),
    details: z.object({ email: z.string().email() }),
  }),
]);

/* ------------------------------- CREATE --------------------------------- */

export async function createPaymentMethod(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const body = req.body ?? {};

  if (body?.methodType === "CreditCard") {
    throw new AppError(
      "Card payments are not enabled yet. Please use Mobile Money or PayPal.",
      400,
    );
  }

  const parsed = paymentMethodSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors as any);
  }

  await connection();

  const instance = new PaymentMethod({
    userId: new Types.ObjectId(userId),
    methodType: parsed.data.methodType,
    details: parsed.data.details,
  } as any);
  await instance.save();

  res.status(201).json({ success: true, data: instance.toJSON() });
}

/* -------------------------------- LIST ---------------------------------- */

export async function getUserPaymentMethods(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const userId = req.user!.id;

  const methods = await PaymentMethod.find({
    userId: new Types.ObjectId(userId),
  })
    .populate({ path: "details.billingAddressId", model: "Address" })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ data: JSON.parse(JSON.stringify(methods)) });
}

/* ------------------------------- DELETE --------------------------------- */

export async function deletePaymentMethod(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const id = param(req, "id");

  await connection();
  const result = await PaymentMethod.findOneAndDelete({
    _id: id,
    userId: new Types.ObjectId(userId),
  });
  if (!result)
    throw new AppError("Payment method not found or unauthorized", 404);

  res.json({ success: true, message: "Deleted" });
}

/* -------------------------- UPDATE credit card -------------------------- */

export async function updateCreditCard(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.id;
  const id = param(req, "id");
  const { expiryDate, cardholderName, billingAddressId } = req.body ?? {};

  await connection();

  if (billingAddressId) {
    const address = await Address.findOne({
      _id: billingAddressId,
      userId: new Types.ObjectId(userId),
    });
    if (!address) throw new AppError("Invalid billing address", 400);
  }

  const update: Record<string, any> = {};
  if (expiryDate) {
    const [expiryMonth, expiryYear] = String(expiryDate).split("/");
    update["details.expiryDate"] = expiryDate;
    update["details.expiryMonth"] = expiryMonth;
    update["details.expiryYear"] = expiryYear;
  }
  if (cardholderName) update["details.cardholderName"] = cardholderName;
  if (billingAddressId) {
    update["details.billingAddressId"] = new Types.ObjectId(billingAddressId);
  }

  const updated = await PaymentMethod.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId), methodType: "CreditCard" },
    { $set: update },
    { new: true, runValidators: true },
  ).populate("details.billingAddressId");
  if (!updated)
    throw new AppError("Credit card not found or unauthorized", 404);

  res.json({ success: true, data: updated.toJSON() });
}
