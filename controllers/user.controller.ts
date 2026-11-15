import type { Request, Response } from "express";
import User from "../models/User.js";
import { connection } from "../config/db.js";
import { AppError } from "../middleware/error.middleware.js";
import { AuthRequest } from "../types/auth.js";

const ALLOWED_ROLES = ["customer", "seller", "admin", "support"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

/* ------------------------- PATCH /api/users/:id/role ---------------------- */

export async function updateUserRole(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const { id } = req.params;
  const { role, permissions } = req.body as {
    role?: unknown;
    permissions?: unknown;
  };

  if (
    typeof role !== "string" ||
    !ALLOWED_ROLES.includes(role as AllowedRole)
  ) {
    throw new AppError("Invalid role", 400);
  }

  const sanitizedPermissions = Array.isArray(permissions)
    ? Array.from(
        new Set(
          permissions
            .filter((p): p is string => typeof p === "string")
            .map((p) => p.trim())
            .filter(Boolean),
        ),
      )
    : [];

  const actor = (req as AuthRequest).user!;
  if (actor.id === id && role !== "admin") {
    throw new AppError("You cannot remove your own admin role.", 400);
  }

  const user = await User.findByIdAndUpdate(
    id,
    { $set: { role, permissions: sanitizedPermissions } },
    { new: true, runValidators: true },
  );

  if (!user) throw new AppError("User not found", 404);

  res.json({
    success: true,
    message: "User updated successfully",
    data: user.toJSON(),
  });
}

/* --------------------------- GET /api/users (admin) ----------------------- */

export async function listUsers(_req: Request, res: Response): Promise<void> {
  await connection();
  const users = await User.find().lean();

  res.json({
    data: users.map((u) => ({
      ...u,
      _id: u._id.toString(),
      createdAt: u.createdAt?.toISOString?.() ?? null,
      updatedAt: u.updatedAt?.toISOString?.() ?? null,
    })),
  });
}

/* ------------------------ GET /api/users/:id (admin) ---------------------- */

export async function getUserById(req: Request, res: Response): Promise<void> {
  await connection();
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found", 404);
  res.json({ data: user.toJSON() });
}

/* ---------------------------- GET /api/users/me --------------------------- */

export async function getMe(req: Request, res: Response): Promise<void> {
  await connection();
  const userId = (req as AuthRequest).user!.id;

  const user = await User.findById(userId)
    .select(
      "name email image dateOfBirth gender phone phoneVerified preferences profileCompleted onboardingCompleted role status",
    )
    .lean();

  if (!user) throw new AppError("User not found", 404);
  res.json({ data: user });
}

/* --------------------------- PATCH /api/users/me -------------------------- */

interface UpdateMePayload {
  name?: string;
  image?: string | null;
  dateOfBirth?: string | Date | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  phone?: {
    countryCode?: string | null;
    number?: string | null;
    e164?: string | null;
  };
  preferences?: {
    language?: string;
    currency?: string;
    theme?: "light" | "dark" | "system";
    timezone?: string;
    country?: string | null;
    notifications?: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
      whatsapp?: boolean;
    };
    marketing?: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
      whatsapp?: boolean;
      productRecommendations?: boolean;
    };
    priceDropAlerts?: boolean;
    backInStockAlerts?: boolean;
  };
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  await connection();

  const payload = (req.body ?? {}) as UpdateMePayload;
  const userId = (req as AuthRequest).user!.id;
  const update: Record<string, any> = {};

  if (payload.name !== undefined) update.name = payload.name;
  if (payload.image !== undefined) update.image = payload.image;
  if (payload.dateOfBirth !== undefined)
    update.dateOfBirth = payload.dateOfBirth;
  if (payload.gender !== undefined) update.gender = payload.gender;

  if (payload.phone) {
    const cc = payload.phone.countryCode ?? "";
    const num = payload.phone.number ?? "";
    update.phone = {
      countryCode: payload.phone.countryCode ?? null,
      number: payload.phone.number ?? null,
      e164:
        payload.phone.e164 ??
        (cc && num ? `${cc}${num.replace(/\s+/g, "")}` : null),
    };
  }

  const merged = await User.findById(userId)
    .select("name phone image preferences")
    .lean();
  if (!merged) throw new AppError("User not found", 404);

  if (payload.preferences) {
    const currentPrefs: any = merged.preferences ?? {};
    update.preferences = {
      ...currentPrefs,
      ...payload.preferences,
      notifications: {
        ...(currentPrefs.notifications ?? {}),
        ...(payload.preferences.notifications ?? {}),
      },
      marketing: {
        ...(currentPrefs.marketing ?? {}),
        ...(payload.preferences.marketing ?? {}),
      },
    };
  }

  // Recompute profileCompleted
  const finalName = update.name ?? merged.name;
  const finalPhone = update.phone ?? (merged as any).phone;
  const finalImage = update.image ?? merged.image;
  const finalPrefs: any =
    update.preferences ?? (merged as any).preferences ?? {};

  const hasName = Boolean((finalName ?? "").toString().trim());
  const hasPhone = Boolean(finalPhone?.number);
  const hasAvatar = Boolean(finalImage);
  const hasPrefs = Boolean(
    finalPrefs.language && finalPrefs.currency && finalPrefs.theme,
  );
  update.profileCompleted = hasName && hasPhone && hasAvatar && hasPrefs;

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    {
      new: true,
      runValidators: true,
    },
  )
    .select(
      "name email image phone preferences profileCompleted onboardingCompleted role status",
    )
    .lean();

  if (!updated) throw new AppError("User not found", 404);
  res.json({ data: updated });
}
