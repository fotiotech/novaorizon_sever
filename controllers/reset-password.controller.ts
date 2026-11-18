import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { connection } from "../config/db.js";
import { ValidationError } from "../middleware/error.middleware.js";
import { consumeRateLimit, getClientIp } from "../utils/rate-limit.js";

/**
 * Completes a password reset started by `POST /auth/forgot-password`.
 *
 * The token is single-use: it is consumed in the same atomic update that
 * stores the new hash.
 */
export async function resetPassword(
  req: Request,
  res: Response,
): Promise<void> {
  const ip = getClientIp(req as any);
  const limit = consumeRateLimit(`reset-pw:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.ok) {
    throw new Error("Too many attempts. Please try again later.");
  }

  const token = String(req.body?.token ?? "").trim();
  const password = String(req.body?.password ?? "");

  if (!token || !password) {
    throw new ValidationError({
      token: token ? undefined : ["Reset token is required"],
      password: password ? undefined : ["Password is required"],
    });
  }

  if (password.length < 8) {
    throw new ValidationError({
      password: ["Password must be at least 8 characters"],
    });
  }

  await connection();

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpiry: { $gt: new Date() },
  });

  if (!user) {
    throw new ValidationError({ token: ["Invalid or expired recovery token"] });
  }

  // The User schema hashes on `save`; updateOne bypasses that hook, so hash
  // here as well.
  const hashedPassword = await bcrypt.hash(password, 12);

  await User.updateOne(
    { _id: user._id },
    {
      $set: { password: hashedPassword },
      $unset: { resetPasswordToken: "", resetPasswordExpiry: "" },
    },
  );

  res.json({ success: true, message: "Your password has been reset." });
}
