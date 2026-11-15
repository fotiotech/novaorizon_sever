import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AppRole } from "../types/auth.js";

export interface JwtClaims {
  sub: string;
  role: AppRole;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

export function signToken(
  claims: JwtClaims,
  expiresIn: SignOptions["expiresIn"] = "7d",
): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn });
}

export function verifyToken(token: string): JwtClaims {
  return jwt.verify(token, env.jwtSecret) as JwtClaims;
}
