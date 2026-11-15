import type { Request, Response } from "express";
import crypto from "node:crypto";
import User from "../models/User.js";
import { connection } from "../config/db.js";
import {
  AppError,
  UnauthorizedError,
  ValidationError,
} from "../middleware/error.middleware.js";
import { SigninSchema, SignupSchema } from "../schemas/auth.schema.js";
import { signToken } from "../utils/jwt.js";
import { consumeRateLimit, getClientIp } from "../utils/rate-limit.js";
import type { AppRole } from "../types/auth.js";

/* ---------------------------- POST /api/auth/signup --------------------------- */
/* Admin-only: creates a pre-verified *seller* (staff) account.                 */
/* Public self-signup would go through a different flow.                        */

export async function signup(req: Request, res: Response): Promise<void> {
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors);
  }
  const { name, email, password } = parsed.data;

  await connection();

  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) throw new AppError("Email is already registered.", 409);

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const tokenExpiry = new Date(Date.now() + 3_600_000);

  const user = await new User({
    name,
    email,
    password,
    isVerified: true,
    emailVerified: new Date(),
    status: "active",
    verificationToken,
    tokenExpiry,
    role: "seller",
    profileCompleted: false,
  }).save();

  res.status(201).json({
    message: "Account created successfully. The user can now log in.",
    data: {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    },
  });
}

/* ---------------------------- POST /api/auth/login ---------------------------- */
/* Replaces the NextAuth Credentials provider. Returns a JWT.                   */

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = SigninSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors);
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

  // Original had this check commented out — kept commented for parity.
  // if (!user.isVerified) {
  //   throw new AppError('Email address is unverified. Check your inbox.', 403);
  // }
  if (user.status !== "active") {
    throw new AppError("Account is not active.", 403);
  }

  // Bookkeeping (the original did this implicitly via lastLoginAt on save)
  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date() }, $inc: { loginCount: 1 } },
  );

  const token = signToken({
    sub: user._id.toString(),
    role: user.role as AppRole,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
  });

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
