import type { Request, Response } from "express";
import { connection } from "../config/db.js";
import { refreshEnv } from "../config/env.js";
import { resetS3Client } from "../utils/s3.js";
import { resetPusher } from "../utils/pusher.js";
import { resetVoyageClient } from "../utils/embedProduct.js";
import {
  MANAGED_SECRETS,
  invalidateSecretManagerCache,
  readSecretValues,
  writeSecretValues,
} from "../config/secrets.js";

function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function getIntegrationSecrets(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const values = await readSecretValues();
  res.json({
    data: {
      source: "aws-secrets-manager",
      groups: MANAGED_SECRETS.map((definition) => ({
        ...definition,
        configured: Boolean(values[definition.key]),
        preview: mask(values[definition.key] ?? ""),
      })),
    },
  });
}

export async function updateIntegrationSecrets(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const raw = req.body?.values;
  if (!raw || typeof raw !== "object") {
    res.status(400).json({ error: "values object is required" });
    return;
  }

  const allowed = new Set(MANAGED_SECRETS.map((entry) => entry.key));
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key) || typeof value !== "string") continue;
    if (value.trim() === "") continue;
    patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No managed secret values supplied" });
    return;
  }

  const next = await writeSecretValues(patch);
  for (const [key, value] of Object.entries(patch)) {
    process.env[key] = value;
  }
  invalidateSecretManagerCache();
  refreshEnv();
  resetS3Client();
  resetPusher();
  resetVoyageClient();

  res.json({
    success: true,
    updated: Object.keys(patch),
    configured: Object.keys(next).length,
    note: "S3, Pusher, Voyage and per-request integrations now use the new values. MongoDB and already-issued sessions still require a restart.",
  });
}