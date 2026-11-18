import type { Request, Response } from "express";
import crypto from "node:crypto";
import { Resend } from "resend";
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

    const verificationUrl = `${env.frontendUrl.replace(/\/$/, "")}/verify?token=${token}`;

    const resend = new Resend(env.resendApiKey);
    await resend.emails.send({
      from: "Novaorizon <onboarding@resend.dev>",
      to: email,
      subject: "Verify your email",
      html: `<p>Confirm your address by clicking <a href="${verificationUrl}">this link</a>. It expires in 1 hour.</p>`,
    });

    respond();
  } catch (error) {
    console.error("[resend-verification]", error);
    respond();
  }
}
