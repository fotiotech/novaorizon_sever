import type { Request, Response } from "express";
import mongoose from "mongoose";
import Offer from "../models/Offer.js";
import Product from "../models/Product.js";
import { invalidateRenderPromotionCache } from "../utils/render-promotions.js";
import { revalidateClientTags } from "../utils/revalidate-client.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function createOffer(req: Request, res: Response): Promise<void> {
  await connection();
  const {
    name,
    description,
    type,
    discountValue,
    buyQuantity,
    getQuantity,
    bundleQuantity,
    conditions,
    eligibility,
    isActive,
  } = req.body ?? {};

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
    buyQuantity,
    getQuantity,
    bundleQuantity,
    conditions,
    eligibility,
    isActive: isActive !== false,
  });

  const eligible = Array.isArray(conditions?.eligibleProducts)
    ? conditions.eligibleProducts
    : [];
  if (eligible.length > 0) {
    await Product.updateMany(
      { _id: { $in: eligible } },
      { $addToSet: { offerIds: offer._id } },
    );
  }

  invalidateRenderPromotionCache();
  void revalidateClientTags(["blocks", "promotions"]);
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
    returnDocument: "after",
  });
  if (!updated) throw new AppError("Offer not found", 404);

  // Keep eligibility arrays for category/brand offers in sync with Product.offerIds.
  // (Product sync below.)
  await Product.updateMany({ offerIds: updated._id }, { $pull: { offerIds: updated._id } });
  const eligible = Array.isArray(updated.conditions?.eligibleProducts)
    ? updated.conditions.eligibleProducts
    : [];
  if (eligible.length > 0) {
    await Product.updateMany(
      { _id: { $in: eligible } },
      { $addToSet: { offerIds: updated._id } },
    );
  }

  invalidateRenderPromotionCache();
  void revalidateClientTags(["blocks", "promotions"]);
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
  await Product.updateMany({ offerIds: deleted._id }, { $pull: { offerIds: deleted._id } });
  invalidateRenderPromotionCache();
  void revalidateClientTags(["blocks", "promotions"]);
  res.json({ success: true });
}

/* ------------------- category / brand eligibility --------------------- */

const ELIGIBILITY_FIELD: Record<string, string> = {
  category: "categoryIds",
  brand: "brandIds",
};

export async function getEntityOffers(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const kind = String(req.params.kind ?? "");
  const id = String(req.params.id ?? "");
  const field = ELIGIBILITY_FIELD[kind];
  if (!field || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid entity"] });
  }

  const offers = await Offer.find({ [`eligibility.${field}`]: id })
    .select("_id")
    .lean();
  res.json({ data: offers.map((offer) => String(offer._id)) });
}

export async function syncEntityOffers(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const kind = String(req.params.kind ?? "");
  const id = String(req.params.id ?? "");
  const field = ELIGIBILITY_FIELD[kind];
  if (!field || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid entity"] });
  }

  const offerIds = Array.isArray(req.body?.offerIds)
    ? req.body.offerIds.filter((value: any) =>
        mongoose.Types.ObjectId.isValid(String(value)),
      )
    : [];

  await Offer.updateMany(
    { _id: { $nin: offerIds }, [`eligibility.${field}`]: id },
    { $pull: { [`eligibility.${field}`]: id } },
  );
  if (offerIds.length > 0) {
    await Offer.updateMany(
      { _id: { $in: offerIds } },
      { $addToSet: { [`eligibility.${field}`]: id } },
    );
  }

  invalidateRenderPromotionCache();
  void revalidateClientTags(["blocks", "promotions"]);
  res.json({ success: true });
}
