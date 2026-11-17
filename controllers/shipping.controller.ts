import type { Request, Response } from "express";
import mongoose from "mongoose";
import Shipping from "../models/Shipping.js";
import Order from "../models/Order.js";
import "../models/User.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

const statusTransitions: Record<string, string[]> = {
  pending: ["cancelled", "assigned"],
  assigned: ["in_transit"],
  in_transit: ["delivered"],
  delivered: ["completed", "returned"],
  returned: [],
  completed: [],
  cancelled: [],
};

export async function createShipping(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const shipping = await Shipping.create(req.body ?? {});
  res.status(201).json({ success: true, data: shipping.toObject() });
}

export async function getShippingById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid shipping ID"] });
  }
  await connection();
  const shipping = await Shipping.findById(id).lean();
  if (!shipping) throw new AppError("Shipping entry not found", 404);
  res.json({ data: shipping });
}

export async function getAllShippings(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const shippings = await Shipping.find({}).lean();
  res.json({ data: shippings });
}

export async function updateShipping(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid shipping ID"] });
  }
  await connection();

  const data = req.body ?? {};
  const shipping = await Shipping.findById(id);
  if (!shipping) throw new AppError(`Shipping entry ${id} not found`, 404);

  if (data.status && data.status !== shipping.status) {
    if (!statusTransitions[shipping.status]?.includes(data.status)) {
      throw new AppError(
        `Invalid status transition from ${shipping.status} to ${data.status}`,
        400,
      );
    }
  }

  const updateData: Record<string, any> = { ...data };
  if (data.status === "returned") {
    updateData.returnReason = data.returnReason;
  } else if (shipping.status !== "returned" && data.status !== "returned") {
    // NOTE: preserved from original — mongoose ignores `undefined` in $set,
    // so this never actually clears returnReason. If you want it cleared,
    // use `$unset: { returnReason: "" }` in a separate update block.
    updateData.returnReason = undefined;
  }

  const updated = await Shipping.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (data.status && data.status !== shipping.status) {
    await Order.findByIdAndUpdate(
      shipping.orderId,
      {
        // NOTE: preserved from original — raw `data.status` is often not a
        // valid Order.shippingStatus value. See mapToOrderShippingStatus()
        // at the top of this file if you want to fix that.
        shippingStatus: data.status,
        ...(data.status === "completed" && { orderStatus: "completed" }),
      },
      { new: true, runValidators: false },
    );
  }

  res.json({ success: true, data: updated?.toObject() });
}

export async function deleteShipping(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid shipping ID"] });
  }
  await connection();

  const deleted = await Shipping.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Shipping entry not found", 404);
  res.json({ success: true });
}
