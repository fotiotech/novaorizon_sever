import type { Request, Response } from "express";
import crypto from "node:crypto";
import User from "../models/User.js";
import { connection } from "../config/db.js";
import { env } from "../config/env.js";
import { ValidationError } from "../middleware/error.middleware.js";
import { consumeRateLimit, getClientIp } from "../utils/rate-limit.js";
import { sendEmail } from "../utils/messaging/providers.js";

const SUCCESS_MESSAGE = "If that account exists, a reset link has been sent!";

export async function forgotPassword(
  req: Request,
  res: Response,
): Promise<void> {
  // Rate limit — 5 requests per 15 minutes per IP. Prevent mailbox flooding
  // and the DoS vector where an attacker burns your Resend quota.
  const ip = getClientIp(req as any);
  const limit = consumeRateLimit(`forgot-pw:${ip}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    // Same generic message — don't reveal whether rate-limiting fired for
    // a real or fake email.
    res.json({ success: true, message: SUCCESS_MESSAGE });
    return;
  }

  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new ValidationError({ email: ["Please provide an email address."] });
  }

  // Always return the same message regardless of what happens next.
  // Security best practice: never reveal whether an account exists,
  // whether the email service is configured, or whether it errored.
  const respond = () => res.json({ success: true, message: SUCCESS_MESSAGE });

  if (!env.resendApiKey) {
    console.error("[forgot-password] RESEND_API_KEY not set — skipping email");
    respond();
    return;
  }

  try {
    await connection();

    const user = await User.findOne({ email });
    if (!user) {
      respond();
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3_600_000);

    await User.updateOne(
      { _id: user._id },
      { $set: { resetPasswordToken: token, resetPasswordExpiry: expires } },
    );

    const base =
      user.role === "customer"
        ? env.frontendUrl
        : env.adminUrl || env.frontendUrl;
    const resetUrl = `${base.replace(/\/$/, "")}/reset-password?token=${token}`;

    await sendEmail({
      to: email,
      subject: "Reset your Novaorizon password",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <h2>Reset your password</h2>
          <p>We received a request to reset your Novaorizon password.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Choose a new password</a></p>
          <p style="color:#666;font-size:12px">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
        </div>
      `,
      text: `Reset your password: ${resetUrl}`,
    });

    respond();
  } catch (error) {
    console.error("[forgot-password]", error);
    respond();
  }
}