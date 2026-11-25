import type { Request, Response } from "express";
import User from "../models/User.js";
import Customer from "../models/Customer.js";
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

function serializeUser(user: any) {
  return {
    _id: String(user._id),
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
    phone: user.phone ?? null,
    role: user.role ?? "customer",
    status: user.status ?? "pending",
    isVerified: Boolean(user.isVerified),
    emailVerified: user.emailVerified ?? null,
    lastActive: user.lastActive ?? user.updatedAt ?? null,
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  };
}

export async function listUsers(_req: Request, res: Response): Promise<void> {
  await connection();
  const users = await User.find()
    .select(
      "name email image phone role status isVerified emailVerified lastActive createdAt updatedAt",
    )
    .sort({ createdAt: -1 })
    .lean();

  res.json({ data: users.map(serializeUser) });
}

/* --------------------------- POST /api/users (admin) --------------------- */

export async function createUser(req: Request, res: Response): Promise<void> {
  await connection();
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "customer");

  if (!name) throw new AppError("Name is required", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("A valid email is required", 400);
  }
  if (password.length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }
  if (!ALLOWED_ROLES.includes(role as AllowedRole)) {
    throw new AppError("Invalid role", 400);
  }

  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) throw new AppError("Email is already registered", 409);

  const user = await new User({
    name,
    email,
    password,
    role,
    status: "active",
    isVerified: true,
    emailVerified: new Date(),
    profileCompleted: false,
  }).save();

  // Keep the customer directory in sync with new accounts.
  if (role === "customer") {
    const parts = name.split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "Customer";
    const lastName = parts.slice(1).join(" ") || "Customer";
    try {
      await Customer.updateOne(
        { userId: user._id },
        {
          $setOnInsert: {
            userId: user._id,
            billingAddress: {
              firstName,
              lastName,
              email,
            },
          },
        },
        { upsert: true },
      );
    } catch (error) {
      console.error("[users] customer profile creation failed", error);
    }
  }

  res.status(201).json({ data: serializeUser(user.toObject()) });
}

/* ------------------------- DELETE /api/users/:id (admin) ------------------ */

export async function deleteUser(req: Request, res: Response): Promise<void> {
  await connection();
  const id = String(req.params.id ?? "");
  const actor = (req as AuthRequest).user!;
  if (actor.id === id) {
    throw new AppError("You cannot delete your own account.", 400);
  }

  const user = await User.findByIdAndDelete(id);
  if (!user) throw new AppError("User not found", 404);

  await Customer.deleteOne({ userId: user._id });
  res.json({ success: true });
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