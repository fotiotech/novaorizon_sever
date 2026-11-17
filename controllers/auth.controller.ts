import type { Request, Response } from "express";
import crypto from "node:crypto";
import User from "../models/User.js";
import { connection } from "../config/db.js";
import { env, isProd } from "../config/env.js";
import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../middleware/error.middleware.js";
import { SigninSchema, SignupSchema } from "../schemas/auth.schema.js";
import { signToken } from "../utils/jwt.js";
import { consumeRateLimit, getClientIp } from "../utils/rate-limit.js";
import type { AppRole } from "../types/auth.js";

const SESSION_COOKIE = "session";

/**
 * Cookie lifetime. Matches the default `JWT_EXPIRES_IN=30d`.
 *
 * If you ever shorten `JWT_EXPIRES_IN`, the token will expire before
 * the cookie does — that's fine (the JWT is verified on every request),
 * but the user gets 401'd on requests past the token's life. Either
 * keep both at 30d or add a `/auth/refresh` endpoint that mints a new
 * token while the cookie is still valid.
 */
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions(maxAgeMs: number = COOKIE_MAX_AGE_MS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    domain: env.cookieDomain || undefined,
    path: "/",
    maxAge: maxAgeMs,
  };
}

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

  // Browser path: httpOnly cookie. API clients ignore it.
  res.cookie(SESSION_COOKIE, token, cookieOptions());
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

export async function logout(_req: Request, res: Response): Promise<void> {
  // clearCookie must use the same options (path, domain) as when it was
  // set, or the browser won't match the existing cookie. httpOnly and
  // secure don't affect matching but are harmless to pass.
  res.clearCookie(SESSION_COOKIE, cookieOptions());
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
  // TODO: import { sendEmail } from "../utils/messaging/providers.js";
  // await sendEmail({ to: email, subject: "Verify your email", html: `...` });

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

  res.cookie(SESSION_COOKIE, token, cookieOptions());
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
