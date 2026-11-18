import mongoose from "mongoose";
import Carrier from "../models/Carrier.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

/**
 * Shipping price for a carrier + region (base price plus weight cost).
 * Mirrors the admin carrier calculator without going through Express.
 */
export async function quoteShippingPrice(
  carrierId: string,
  region: string,
  weight = 0,
): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(carrierId)) {
    throw new ValidationError({ carrierId: ["Invalid carrier id"] });
  }

  await connection();
  const carrier: any = await Carrier.findById(carrierId).lean();
  if (!carrier) throw new AppError("Carrier not found", 404);

  const details = (carrier.regionsServed ?? []).find(
    (r: any) =>
      String(r.region).toLowerCase() === String(region).toLowerCase(),
  );
  if (!details) {
    throw new AppError(`Region ${region} is not served by this carrier`, 404);
  }

  const base = Number(details.basePrice) || 0;
  const costWeight = Number(carrier.costWeight) || 0;
  return Math.max(0, base + Number(weight || 0) * costWeight);
}
