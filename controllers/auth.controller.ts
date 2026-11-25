import type { Request, Response } from "express";
import crypto from "node:crypto";
import User from "../models/User.js";
import Customer from "../models/Customer.js";
import { connection } from "../config/db.js";
import { env } from "../config/env.js";
import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../middleware/error.middleware.js";
import { SigninSchema, SignupSchema } from "../schemas/auth.schema.js";
import { sendEmail } from "../utils/messaging/providers.js";
import { signToken } from "../utils/jwt.js";
import { consumeRateLimit, getClientIp } from "../utils/rate-limit.js";
import type { AppRole } from "../types/auth.js";
import {
  cookieOptions,
  resolveAudience,
  sessionCookieName,
} from "../utils/auth-cookies.js";

/* ------------------------------ Login ----------------------------------- */

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = SigninSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors as any);
  }
  const { email, password } = parsed.data;

  const ip = getClientIp(req as any);
  const limit = consumeRateLimit(`login:${ip}:${email}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    throw new AppError("Too many sign-in attempts. Try again later.", 429);
  }

  await connection();

  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new UnauthorizedError("Invalid credentials");

  const ok = await user.matchPassword(password);
  if (!ok) throw new UnauthorizedError("Invalid credentials");

  if (user.status !== "active") {
    throw new AppError("Account is not active.", 403);
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date() }, $inc: { loginCount: 1 } },
  );

  const token = signToken(
    {
      sub: user._id.toString(),
      role: user.role as AppRole,
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
    },
    env.jwtExpiresIn as Parameters<typeof signToken>[1],
  );

  // Browser path: httpOnly cookie, scoped to this app's audience so an admin
  // login cannot replace the storefront session.
  res.cookie(sessionCookieName(resolveAudience(req)), token, cookieOptions());
  // API path: token in the body for `Authorization: Bearer …` consumers.
  res.json({
    data: {
      token,
      user: {
        id: user._id.toString(),
        name: user.name ?? null,
        email: user.email,
        role: user.role,
        image: user.image ?? null,
      },
    },
  });
}

/* ------------------------------ Logout ---------------------------------- */

export async function logout(req: Request, res: Response): Promise<void> {
  // Only clear the session for the app that asked; the other app's session
  // stays intact. clearCookie needs the same path/domain as the original.
  res.clearCookie(sessionCookieName(resolveAudience(req)), cookieOptions());
  res.json({ success: true });
}

/* ---------------------------- Current user ------------------------------ */

export async function me(req: Request, res: Response): Promise<void> {
  await connection();
  const user = await User.findById(req.user!.id)
    .select("name email image role status preferences")
    .lean();
  if (!user) throw new UnauthorizedError("User no longer exists");
  res.json({ data: user });
}

/* ------------------------ Unified signup -------------------------------- */

const VALID_ROLES: AppRole[] = ["customer", "seller", "support", "admin"];

export async function signup(req: Request, res: Response): Promise<void> {
  // 1. Validate body
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors as any);
  }
  const { name, email, password } = parsed.data;

  // 2. Resolve requested role (defaults to customer)
  const requestedRole = String(req.body?.role ?? "customer").toLowerCase();
  if (!VALID_ROLES.includes(requestedRole as AppRole)) {
    throw new ValidationError({ role: [`Invalid role: ${requestedRole}`] });
  }
  const role = requestedRole as AppRole;
  const isStaffRole = role !== "customer";

  // 3. Authorization gate
  //    Public path: only customers
  //    Staff path: admin JWT required
  if (isStaffRole) {
    if (!req.user) throw new UnauthorizedError();
    if (req.user.role !== "admin") {
      throw new ForbiddenError("Only admins can create staff accounts.");
    }
  }

  // 4. Rate limit
  //    - Unauthenticated customer signup: 5 / hour / IP
  //    - Admin staff signup: 30 / hour / admin
  const ip = getClientIp(req as any);
  const rateKey = isStaffRole
    ? `signup:staff:${req.user!.id}`
    : `signup:customer:${ip}`;
  const rateLimit = isStaffRole ? 30 : 5;
  const limit = consumeRateLimit(rateKey, rateLimit, 60 * 60 * 1000);
  if (!limit.ok) {
    throw new AppError(
      isStaffRole
        ? "Too many staff accounts created. Try again later."
        : "Too many registration attempts. Try again later.",
      429,
    );
  }

  await connection();

  // 5. Duplicate check (single roundtrip)
  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) throw new AppError("Email is already registered.", 409);

  // 6. Create user
  //    - customer: requires email verification, auto-login
  //    - staff: pre-verified (admin is vouching), no auto-login
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const tokenExpiry = new Date(
    Date.now() + (isStaffRole ? 3_600_000 : 24 * 3_600_000),
  );

  const user = await new User({
    name,
    email,
    password,
    isVerified: isStaffRole,
    emailVerified: isStaffRole ? new Date() : null,
    status: "active",
    verificationToken,
    tokenExpiry,
    role,
    profileCompleted: false,
  }).save();

  // Keep the customer directory in sync with the new account.
  if (!isStaffRole) {
    const parts = name.split(/\s+/).filter(Boolean);
    try {
      await Customer.updateOne(
        { userId: user._id },
        {
          $setOnInsert: {
            userId: user._id,
            billingAddress: {
              firstName: parts[0] ?? "Customer",
              lastName: parts.slice(1).join(" ") || "Customer",
              email,
            },
          },
        },
        { upsert: true },
      );
    } catch (error) {
      console.error("[signup] customer profile creation failed", error);
    }
  }

  // 7. Branch response
  if (isStaffRole) {
    // Staff: do NOT auto-login. The staff member signs in separately.
    res.status(201).json({
      success: true,
      message: `Account created. The user can now log in as ${role}.`,
      data: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
      },
    });
    return;
  }

  // Customer: send verification email, auto-login
  const verificationUrl = `${env.frontendUrl.replace(/\/$/, "")}/verify?token=${verificationToken}`;
  try {
    await sendEmail({
      to: email,
      subject: "Verify your Novaorizon email",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <h2>Welcome to Novaorizon</h2>
          <p>Confirm your email address to finish setting up your account.</p>
          <p><a href="${verificationUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Verify email</a></p>
          <p style="color:#666;font-size:12px">This link expires in 24 hours. If you did not create an account, ignore this email.</p>
        </div>
      `,
      text: `Verify your email: ${verificationUrl}`,
    });
  } catch (error) {
    console.error("[signup] verification email failed", error);
  }

  const token = signToken(
    {
      sub: user._id.toString(),
      role: "customer",
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
    },
    env.jwtExpiresIn as Parameters<typeof signToken>[1],
  );

  res.cookie(sessionCookieName("client"), token, cookieOptions());
  res.status(201).json({
    success: true,
    message:
      "Account created. Check your email to verify your address; you can browse now.",
    data: {
      token,
      user: {
        id: user._id.toString(),
        name: user.name ?? null,
        email: user.email,
        role: "customer",
        image: user.image ?? null,
      },
    },
  });
}