import type { Request, Response } from "express";
import crypto from "node:crypto";
import { sendEmail } from "../utils/messaging/providers.js";
import User from "../models/User.js";
import { connection } from "../config/db.js";
import { env } from "../config/env.js";
import { ValidationError } from "../middleware/error.middleware.js";
import { consumeRateLimit, getClientIp } from "../utils/rate-limit.js";

/** Email verification: confirm a token, or resend it. */

const GENERIC_SENT =
  "If that account exists and is unverified, a new link has been sent!";

/* ------------------------------ verify ---------------------------------- */

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const token = String(req.body?.token ?? req.query.token ?? "").trim();
  if (!token) {
    throw new ValidationError({ token: ["Verification token is required"] });
  }

  await connection();

  const user: any = await User.findOne({
    verificationToken: token,
    tokenExpiry: { $gt: new Date() },
  });
  if (!user) {
    throw new ValidationError({ token: ["Invalid or expired token"] });
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: { isVerified: true, status: "active", emailVerified: new Date() },
      $unset: { verificationToken: "", tokenExpiry: "" },
    },
  );

  res.json({ success: true, message: "Email verified." });
}

/* --------------------------- resend link -------------------------------- */

export async function resendVerification(
  req: Request,
  res: Response,
): Promise<void> {
  const ip = getClientIp(req as any);
  const limit = consumeRateLimit(`resend-verify:${ip}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    res.json({ success: true, message: GENERIC_SENT });
    return;
  }

  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new ValidationError({ email: ["Email is required"] });
  }

  const respond = () => res.json({ success: true, message: GENERIC_SENT });

  if (!env.resendApiKey) {
    console.error("[resend-verification] RESEND_API_KEY not set");
    respond();
    return;
  }

  try {
    await connection();
    const user: any = await User.findOne({ email });
    if (!user || user.isVerified) {
      respond();
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3_600_000);

    await User.updateOne(
      { _id: user._id },
      { $set: { verificationToken: token, tokenExpiry: expires } },
    );

    const base =
      user.role === "customer"
        ? env.frontendUrl
        : env.adminUrl || env.frontendUrl;
    const verificationUrl = `${base.replace(/\/$/, "")}/verify?token=${token}`;

    await sendEmail({
      to: email,
      subject: "Verify your Novaorizon email",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <h2>Verify your email</h2>
          <p>Confirm your address to finish setting up your Novaorizon account.</p>
          <p><a href="${verificationUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Verify email</a></p>
          <p style="color:#666;font-size:12px">This link expires in 1 hour.</p>
        </div>
      `,
      text: `Verify your email: ${verificationUrl}`,
    });

    respond();
  } catch (error) {
    console.error("[resend-verification]", error);
    respond();
  }
}