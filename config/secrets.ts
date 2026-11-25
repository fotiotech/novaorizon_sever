import "dotenv/config";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  CreateSecretCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-secrets-manager";

/**
 * Central AWS Secrets Manager loader.
 *
 * Bootstrap values still come from the environment (they cannot live inside
 * the secret they are used to fetch): AWS_REGION, AWS_SECRET_NAME and optional
 * static credentials. Everything else can be uploaded from the admin
 * integration screen and is merged into process.env before the app modules
 * read `config/env.ts`.
 */

const REGION =
  process.env.AWS_SECRET_REGION ||
  process.env.AWS_REGION ||
  "us-east-1";
const SECRET_NAME = process.env.AWS_SECRET_NAME || "novaorizon";

const explicitCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

let client: SecretsManagerClient | null = null;
function getClient(): SecretsManagerClient {
  if (!client) {
    client = new SecretsManagerClient({
      region: REGION,
      credentials: explicitCredentials,
    });
  }
  return client;
}

export interface SecretDefinition {
  key: string;
  label: string;
  group: string;
  hint?: string;
}

/** Keys surfaced in the admin integration UI. */
export const MANAGED_SECRETS: SecretDefinition[] = [
  { key: "MONGODB_URI", label: "MongoDB URI", group: "Database" },
  { key: "MONGODB_DB_NAME", label: "MongoDB database", group: "Database" },
  { key: "JWT_SECRET", label: "JWT secret", group: "Auth" },
  { key: "COOKIE_SECRET", label: "Cookie secret", group: "Auth" },
  { key: "COOKIE_DOMAIN", label: "Cookie domain", group: "Auth" },
  { key: "FRONTEND_URL", label: "Storefront URL", group: "App" },
  { key: "ADMIN_URL", label: "Admin URL", group: "App" },
  { key: "CORS_ORIGIN", label: "Allowed origins", group: "App" },
  { key: "REVALIDATE_SECRET", label: "Revalidation secret", group: "App" },
  { key: "AWS_REGION", label: "AWS region", group: "AWS" },
  { key: "AWS_ACCESS_KEY_ID", label: "AWS access key", group: "AWS" },
  { key: "AWS_SECRET_ACCESS_KEY", label: "AWS secret key", group: "AWS" },
  { key: "AWS_BUCKET_NAME", label: "S3 bucket", group: "AWS" },
  { key: "AWS_PUBLIC_BASE_URL", label: "CDN base URL", group: "AWS" },
  { key: "AWS_OBJECT_ACL", label: "S3 object ACL", group: "AWS" },
  { key: "PUSHER_APP_ID", label: "Pusher app id", group: "Pusher" },
  { key: "PUSHER_KEY", label: "Pusher key", group: "Pusher" },
  { key: "PUSHER_SECRET", label: "Pusher secret", group: "Pusher" },
  { key: "PUSHER_CLUSTER", label: "Pusher cluster", group: "Pusher" },
  { key: "RESEND_API_KEY", label: "Resend API key", group: "Email" },
  {
    key: "EMAIL_FROM",
    label: "From address",
    group: "Email",
    hint: "e.g. Novaorizon <hello@novaorizon.com>",
  },
  { key: "VOYAGE_API_KEY", label: "Voyage API key", group: "Embeddings" },
  { key: "PAYMENT_SECRET_KEY", label: "Payment secret", group: "Payments" },
  { key: "MONETBIL_NOTIFY_TOKEN", label: "Monetbil token", group: "Payments" },
];

export type SecretRecord = Record<string, string>;

let cache: { value: Record<string, any>; expiresAt: number } | null = null;
const TTL_MS = 30_000;

export function invalidateSecretManagerCache(): void {
  cache = null;
}

export async function readRawSecret(): Promise<Record<string, any>> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;
  try {
    const res = await getClient().send(
      new GetSecretValueCommand({ SecretId: SECRET_NAME }),
    );
    const raw = res.SecretString ?? "";
    const parsed = raw ? JSON.parse(raw) : {};
    cache = { value: parsed, expiresAt: Date.now() + TTL_MS };
    return parsed;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      cache = { value: {}, expiresAt: Date.now() + TTL_MS };
      return {};
    }
    throw err;
  }
}

export async function readSecretValues(): Promise<SecretRecord> {
  const raw = await readRawSecret();
  const value: SecretRecord = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (typeof entry === "string") value[key] = entry;
  }
  return value;
}

export async function writeRawSecret(
  value: Record<string, any>,
): Promise<void> {
  const SecretString = JSON.stringify(value);
  try {
    await getClient().send(
      new PutSecretValueCommand({ SecretId: SECRET_NAME, SecretString }),
    );
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      await getClient().send(
        new CreateSecretCommand({ Name: SECRET_NAME, SecretString }),
      );
    } else {
      throw err;
    }
  }
  cache = { value, expiresAt: Date.now() + TTL_MS };
  console.log(
    `[secrets] saved ${Object.keys(value).length} value(s) to ${SECRET_NAME} (${REGION})`,
  );
}

export async function writeSecretValues(
  patch: SecretRecord,
): Promise<SecretRecord> {
  const current = await readRawSecret();
  const next = { ...current, ...patch };
  await writeRawSecret(next);
  return Object.fromEntries(
    Object.entries(next).filter(([, value]) => typeof value === "string"),
  ) as SecretRecord;
}

/** Loads the secret JSON into process.env; call before importing app modules. */
export async function loadSecretsIntoEnv(): Promise<void> {
  const enabled =
    process.env.AWS_SECRET_NAME !== undefined ||
    process.env.LOAD_SECRETS === "true";
  if (!enabled) return;

  try {
    const values = await readSecretValues();
    let applied = 0;
    for (const [key, value] of Object.entries(values)) {
      // Empty entries fall back to the existing environment variable.
      if (typeof value !== "string" || value.trim() === "") continue;
      process.env[key] = value;
      applied += 1;
    }
    console.log(
      `[secrets] loaded ${applied} value(s) from ${SECRET_NAME} (${REGION})`,
    );
    if (applied === 0) {
      console.warn(
        `[secrets] no string values found in ${SECRET_NAME} (${REGION}). Check the secret's region, name, and that it is a flat JSON object.`,
      );
    }
  } catch (err) {
    console.error("[secrets] failed to load Secrets Manager values:", err);
  }
}