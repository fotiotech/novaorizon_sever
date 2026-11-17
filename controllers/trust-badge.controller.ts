import type { Request, Response } from "express";
import mongoose from "mongoose";
import TrustBadge from "../models/TrustBadge.js";
import HeroContent from "../models/HeroContent.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { BADGE_ICON_VALUES, isValidBadgeLink } from "../utils/trust-badges.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function serialize(doc: any) {
  return {
    _id: String(doc._id),
    name: doc.name ?? "",
    icon: doc.icon ?? "shield-check",
    title: doc.title ?? "",
    description: doc.description ?? "",
    popupText: doc.popupText ?? "",
    link: doc.link ?? "",
    isActive: !!doc.isActive,
    sortOrder: typeof doc.sortOrder === "number" ? doc.sortOrder : 0,
  };
}

function validate(input: any): string | null {
  if (!input.name?.trim()) return "Internal name is required";
  if (!input.title?.trim()) return "Title is required";
  if (
    !input.icon ||
    !(BADGE_ICON_VALUES as readonly string[]).includes(input.icon)
  ) {
    return "Invalid icon";
  }
  if (input.link && !isValidBadgeLink(String(input.link).trim())) {
    return "Link must be a valid URL or start with /";
  }
  return null;
}

/* -------------------------------- list ---------------------------------- */

export async function listTrustBadges(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const includeInactive = req.query.includeInactive === "true";
  const filter = includeInactive ? {} : { isActive: true };

  const docs = await TrustBadge.find(filter)
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  if (docs.length === 0) {
    res.json({ data: [] });
    return;
  }

  const usage = await HeroContent.aggregate([
    { $unwind: "$trustBadges" },
    {
      $match: {
        "trustBadges.badgeId": { $in: docs.map((d: any) => d._id) },
      },
    },
    { $group: { _id: "$trustBadges.badgeId", count: { $sum: 1 } } },
  ]);
  const usageMap = new Map(
    usage.map((u: any) => [String(u._id), u.count as number]),
  );

  res.json({
    data: docs.map((d: any) => ({
      ...serialize(d),
      usageCount: usageMap.get(String(d._id)) ?? 0,
    })),
  });
}

/**
 * Public — storefront hero renders only active badges.
 * The original required admin; that made the storefront's hero empty.
 */
export async function listActiveTrustBadges(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const docs = await TrustBadge.find({ isActive: true })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  res.json({ data: docs.map(serialize) });
}

export async function getTrustBadge(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid badge ID"] });
  }
  await connection();
  const doc = await TrustBadge.findById(id).lean();
  if (!doc) throw new AppError("Badge not found", 404);
  res.json({ data: serialize(doc) });
}

/* ------------------------------- CREATE --------------------------------- */

export async function createTrustBadge(
  req: Request,
  res: Response,
): Promise<void> {
  const input = req.body ?? {};
  const invalid = validate(input);
  if (invalid) throw new ValidationError({ _form: [invalid] });
  await connection();

  const min: any = await TrustBadge.findOne()
    .sort({ sortOrder: 1 })
    .select("sortOrder")
    .lean();
  const sortOrder =
    typeof input.sortOrder === "number"
      ? input.sortOrder
      : (min?.sortOrder ?? 0) - 1;

  const doc = await TrustBadge.create({
    name: input.name.trim(),
    icon: input.icon,
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    popupText: (input.popupText ?? "").trim(),
    link: (input.link ?? "").trim(),
    isActive: input.isActive ?? true,
    sortOrder,
  });

  res.status(201).json({ success: true, data: serialize(doc.toObject()) });
}

/* ------------------------------- UPDATE --------------------------------- */

export async function updateTrustBadge(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid badge ID"] });
  }
  const input = req.body ?? {};
  const invalid = validate(input);
  if (invalid) throw new ValidationError({ _form: [invalid] });
  await connection();

  const updated: any = await TrustBadge.findByIdAndUpdate(
    id,
    {
      $set: {
        name: input.name.trim(),
        icon: input.icon,
        title: input.title.trim(),
        description: (input.description ?? "").trim(),
        popupText: (input.popupText ?? "").trim(),
        link: (input.link ?? "").trim(),
        ...(input.isActive !== undefined ? { isActive: !!input.isActive } : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
      },
    },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw new AppError("Badge not found", 404);

  const res_ = await HeroContent.updateMany(
    { "trustBadges.badgeId": updated._id },
    {
      $set: {
        "trustBadges.$[b].icon": updated.icon,
        "trustBadges.$[b].title": updated.title,
        "trustBadges.$[b].description": updated.description ?? "",
        "trustBadges.$[b].popupText": updated.popupText ?? "",
        "trustBadges.$[b].link": updated.link ?? "",
      },
    },
    { arrayFilters: [{ "b.badgeId": updated._id }] },
  );

  res.json({
    success: true,
    data: { badge: serialize(updated), syncedHeroes: res_.modifiedCount ?? 0 },
  });
}

/* ------------------------------- DELETE --------------------------------- */

export async function deleteTrustBadge(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid badge ID"] });
  }
  const force = req.query.force === "true";
  await connection();

  const badge = await TrustBadge.findById(id);
  if (!badge) throw new AppError("Badge not found", 404);

  const usage = await HeroContent.countDocuments({ "trustBadges.badgeId": id });

  if (usage > 0 && !force) {
    throw new AppError(
      `This badge is used in ${usage} hero${usage === 1 ? "" : "es"}. Archive it or force-delete to detach it.`,
      409,
    );
  }

  if (usage > 0) {
    await HeroContent.updateMany(
      { "trustBadges.badgeId": badge._id },
      { $set: { "trustBadges.$[b].badgeId": null } },
      { arrayFilters: [{ "b.badgeId": badge._id }] },
    );
  }

  await badge.deleteOne();
  res.json({ success: true, data: { affectedHeroes: usage } });
}

/* ------------------------------ REORDER --------------------------------- */

export async function reorderTrustBadges(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const orderedIds = req.body?.orderedIds;
  if (!Array.isArray(orderedIds)) {
    throw new ValidationError({ orderedIds: ["Must be an array"] });
  }
  const valid = orderedIds.filter(
    (id: any) => typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
  );
  if (valid.length === 0) {
    res.json({ success: true });
    return;
  }

  await TrustBadge.bulkWrite(
    valid.map((id: string, i: number) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } },
    })),
  );
  res.json({ success: true });
}

/* ---------------------------- manual resync ----------------------------- */

export async function resyncTrustBadgeInHeroes(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid badge ID"] });
  }
  await connection();

  const badge: any = await TrustBadge.findById(id).lean();
  if (!badge) throw new AppError("Badge not found", 404);

  const r = await HeroContent.updateMany(
    { "trustBadges.badgeId": badge._id },
    {
      $set: {
        "trustBadges.$[b].icon": badge.icon,
        "trustBadges.$[b].title": badge.title,
        "trustBadges.$[b].description": badge.description ?? "",
        "trustBadges.$[b].popupText": badge.popupText ?? "",
        "trustBadges.$[b].link": badge.link ?? "",
      },
    },
    { arrayFilters: [{ "b.badgeId": badge._id }] },
  );

  res.json({ success: true, data: { syncedHeroes: r.modifiedCount ?? 0 } });
}
