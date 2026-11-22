import type { Request, Response } from "express";
import mongoose from "mongoose";
import HeroContent from "../models/HeroContent.js";
import TrustBadge from "../models/TrustBadge.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { deleteS3Object } from "../utils/s3.js";
import { revalidateClientTag } from "../utils/revalidate-client.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/* -------------------------- trust-badge parser -------------------------- */

interface ITrustBadgeInput {
  badgeId?: string | null;
  icon: string;
  title: string;
  description?: string;
  popupText?: string;
  link?: string;
}

/**
 * Resolves trust badges submitted from the client:
 *   - `badgeId` present + library badge active → fresh snapshot from library.
 *   - `badgeId` present + library badge gone → keep client snapshot, drop ref.
 *   - No `badgeId` → ad-hoc, keep client fields.
 *
 * Entries lacking `icon` or `title` are dropped silently.
 */
async function parseTrustBadges(
  raw: any,
): Promise<{ ok: true; badges: any[] } | { ok: false; message: string }> {
  if (!raw) return { ok: true, badges: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, message: "Invalid trust badges data" };
  }

  const ids = raw
    .map((b: any) => b?.badgeId)
    .filter((id: any) => id && mongoose.Types.ObjectId.isValid(String(id)));

  const library = ids.length
    ? await TrustBadge.find({ _id: { $in: ids } }).lean()
    : [];
  const libMap = new Map(library.map((b: any) => [String(b._id), b]));

  const badges: any[] = [];

  for (const b of raw as ITrustBadgeInput[]) {
    if (!b || !b.icon || !b.title) continue;

    if (b.badgeId) {
      const lib: any = libMap.get(String(b.badgeId));
      if (lib && lib.isActive) {
        badges.push({
          badgeId: lib._id,
          icon: lib.icon,
          title: lib.title,
          description: lib.description ?? "",
          popupText: lib.popupText ?? "",
          link: lib.link ?? "",
        });
        continue;
      }
      // Gone/archived — degrade to ad-hoc, drop ref.
      badges.push({
        badgeId: null,
        icon: String(b.icon).trim(),
        title: String(b.title).trim(),
        description: b.description ? String(b.description).trim() : "",
        popupText: b.popupText ? String(b.popupText).trim() : "",
        link: b.link ? String(b.link).trim() : "",
      });
      continue;
    }

    badges.push({
      badgeId: null,
      icon: String(b.icon).trim(),
      title: String(b.title).trim(),
      description: b.description ? String(b.description).trim() : "",
      popupText: b.popupText ? String(b.popupText).trim() : "",
      link: b.link ? String(b.link).trim() : "",
    });
  }

  return { ok: true, badges };
}

/* ------------------------------ serializer ------------------------------ */

function serializeHero(res: any) {
  return {
    ...res,
    _id: res._id?.toString(),
    created_at:
      res.created_at instanceof Date
        ? res.created_at.toISOString()
        : (res.created_at ?? null),
    updated_at:
      res.updated_at instanceof Date
        ? res.updated_at.toISOString()
        : (res.updated_at ?? null),
    trustBadges: (res.trustBadges ?? []).map((b: any) => ({
      badgeId: b.badgeId ? String(b.badgeId) : null,
      icon: b.icon ?? "",
      title: b.title ?? "",
      description: b.description ?? "",
      popupText: b.popupText ?? "",
      link: b.link ?? "",
    })),
  };
}

/* -------------------------------- reads --------------------------------- */

export async function findHeroContent(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const heroes = await HeroContent.find().sort({ created_at: -1 }).lean();
  res.json({ data: heroes.map(serializeHero) });
}

export async function findHeroContentById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid hero ID"] });
  }
  await connection();

  const hero = await HeroContent.findById(id).lean();
  if (!hero) throw new AppError("Hero content not found", 404);
  res.json({ data: serializeHero(hero) });
}

/* -------------------------------- create -------------------------------- */

export async function createHeroContent(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const body = req.body ?? {};

  const { title, description, cta_text, cta_link, imageUrl } = body;
  if (!title || !description || !cta_text || !cta_link || !imageUrl) {
    throw new ValidationError({
      _form: [
        "title, description, cta_text, cta_link, and imageUrl are required",
      ],
    });
  }

  const parsedBadges = await parseTrustBadges(body.trustBadges);
  if (!parsedBadges.ok) {
    throw new ValidationError({ trustBadges: [parsedBadges.message] });
  }

  const hero = new HeroContent({
    title,
    description,
    imageUrl,
    cta_text,
    cta_link,
    trustBadges: parsedBadges.badges,
  });
  await hero.save();
  void revalidateClientTag("home-hero");

  res.status(201).json({ success: true, data: serializeHero(hero.toObject()) });
}

/* -------------------------------- update -------------------------------- */

export async function updateHeroContent(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid hero ID"] });
  }
  await connection();

  const body = req.body ?? {};
  const { title, description, cta_text, cta_link, imageUrl } = body;
  if (!title || !description || !cta_text || !cta_link || !imageUrl) {
    throw new ValidationError({
      _form: [
        "title, description, cta_text, cta_link, and imageUrl are required",
      ],
    });
  }

  const parsedBadges = await parseTrustBadges(body.trustBadges);
  if (!parsedBadges.ok) {
    throw new ValidationError({ trustBadges: [parsedBadges.message] });
  }

  const updated = await HeroContent.findByIdAndUpdate(
    id,
    {
      title,
      description,
      imageUrl,
      cta_text,
      cta_link,
      trustBadges: parsedBadges.badges,
      updated_at: new Date(),
    },
    { new: true, runValidators: true },
  );
  if (!updated) throw new AppError("Hero content not found", 404);
  void revalidateClientTag("home-hero");

  res.json({ success: true, data: serializeHero(updated.toObject()) });
}

/* -------------------------------- delete -------------------------------- */

export async function deleteHeroContent(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid hero ID"] });
  }
  await connection();

  const hero = await HeroContent.findById(id);
  if (!hero) throw new AppError("Hero content not found", 404);

  if (hero.imageUrl) {
    await deleteS3Object(hero.imageUrl).catch((err) =>
      console.error("[deleteHeroContent] S3 cleanup failed:", err),
    );
  }

  await hero.deleteOne();
  void revalidateClientTag("home-hero");
  res.json({ success: true });
}

/* ---------------------------- image delete ------------------------------ */

export async function deleteHeroImage(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid hero ID"] });
  }
  const fileUrl = req.body?.fileUrl as string | undefined;
  if (!fileUrl) {
    throw new ValidationError({ fileUrl: ["fileUrl is required"] });
  }
  await connection();

  const hero = await HeroContent.findById(id);
  if (!hero) throw new AppError("Hero not found", 404);

  // NOTE (preserved from original): deletes the S3 object but does NOT
  // touch `hero.imageUrl`. The schema requires imageUrl to be non-empty,
  // and the intent is that the form submit (updateHeroContent) writes
  // the replacement URL. Security concern: `fileUrl` is client-provided
  // so any admin can delete any S3 key. If you want stricter behaviour,
  // validate that `fileUrl === hero.imageUrl` before deleting.
  await deleteS3Object(fileUrl);
  res.json({ success: true });
}