import type { Request, Response } from "express";
import Setting from "../models/Setting.js";
import { connection } from "../config/db.js";
import { ValidationError } from "../middleware/error.middleware.js";

const DEFAULT_KEY = "general";

const DEFAULTS = {
  storeName: "",
  storeTagline: "",
  storeDescription: "",
  contactEmail: "",
  contactPhone: "",
  supportEmail: "",
  address: { street: "", city: "", region: "", postalCode: "", country: "" },
  currency: "XAF",
  currencySymbol: "CFA",
  timezone: "Africa/Douala",
  language: "en",
  orderPrefix: "ORD",
  lowStockThreshold: 5,
  maintenanceMode: false,
  logoUrl: "",
  faviconUrl: "",
  socialLinks: {
    facebook: "",
    instagram: "",
    twitter: "",
    tiktok: "",
    youtube: "",
  },
  businessHours: "",
};

function serialize(doc: any) {
  if (!doc) return DEFAULTS;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    storeName: o.storeName ?? "",
    storeTagline: o.storeTagline ?? "",
    storeDescription: o.storeDescription ?? "",
    contactEmail: o.contactEmail ?? "",
    contactPhone: o.contactPhone ?? "",
    supportEmail: o.supportEmail ?? "",
    address: {
      street: o.address?.street ?? "",
      city: o.address?.city ?? "",
      region: o.address?.region ?? "",
      postalCode: o.address?.postalCode ?? "",
      country: o.address?.country ?? "",
    },
    currency: o.currency ?? "XAF",
    currencySymbol: o.currencySymbol ?? "CFA",
    timezone: o.timezone ?? "Africa/Douala",
    language: o.language ?? "en",
    orderPrefix: o.orderPrefix ?? "ORD",
    lowStockThreshold:
      typeof o.lowStockThreshold === "number" ? o.lowStockThreshold : 5,
    maintenanceMode: !!o.maintenanceMode,
    logoUrl: o.logoUrl ?? "",
    faviconUrl: o.faviconUrl ?? "",
    socialLinks: {
      facebook: o.socialLinks?.facebook ?? "",
      instagram: o.socialLinks?.instagram ?? "",
      twitter: o.socialLinks?.twitter ?? "",
      tiktok: o.socialLinks?.tiktok ?? "",
      youtube: o.socialLinks?.youtube ?? "",
    },
    businessHours: o.businessHours ?? "",
  };
}

export async function getGeneralSettings(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const doc = await Setting.findOne({ key: DEFAULT_KEY }).lean();
  res.json({ data: serialize(doc) });
}

export async function updateGeneralSettings(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const input = req.body ?? {};

  const patch: Record<string, any> = {};
  const stringFields = [
    "storeName",
    "storeTagline",
    "storeDescription",
    "contactEmail",
    "contactPhone",
    "supportEmail",
    "currency",
    "currencySymbol",
    "timezone",
    "language",
    "orderPrefix",
    "logoUrl",
    "faviconUrl",
    "businessHours",
  ] as const;

  for (const field of stringFields) {
    if (input[field] !== undefined) {
      patch[field] = String(input[field] ?? "").trim();
    }
  }

  if (input.lowStockThreshold !== undefined) {
    const n = Number(input.lowStockThreshold);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new ValidationError({
        lowStockThreshold: ["Must be a non-negative integer"],
      });
    }
    patch.lowStockThreshold = n;
  }

  if (input.maintenanceMode !== undefined) {
    patch.maintenanceMode = !!input.maintenanceMode;
  }

  if (input.address && typeof input.address === "object") {
    patch.address = {
      street: String(input.address.street ?? "").trim(),
      city: String(input.address.city ?? "").trim(),
      region: String(input.address.region ?? "").trim(),
      postalCode: String(input.address.postalCode ?? "").trim(),
      country: String(input.address.country ?? "").trim(),
    };
  }

  if (input.socialLinks && typeof input.socialLinks === "object") {
    patch.socialLinks = {
      facebook: String(input.socialLinks.facebook ?? "").trim(),
      instagram: String(input.socialLinks.instagram ?? "").trim(),
      twitter: String(input.socialLinks.twitter ?? "").trim(),
      tiktok: String(input.socialLinks.tiktok ?? "").trim(),
      youtube: String(input.socialLinks.youtube ?? "").trim(),
    };
  }

  const updated = await Setting.findOneAndUpdate(
    { key: DEFAULT_KEY },
    { $set: patch, $setOnInsert: { key: DEFAULT_KEY } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  res.json({ success: true, data: serialize(updated) });
}
