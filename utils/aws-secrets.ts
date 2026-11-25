import {
  readRawSecret,
  writeRawSecret,
} from "../config/secrets.js";

/**
 * Facebook Ads settings are stored inside the central app secret under
 * `facebookAds`, next to the environment keys. One AWS identity/secret is used
 * for S3, the app and the Meta integration.
 */
const SECRET_KEY = "facebookAds";

const TTL_MS = 60_000;
let cache: { value: Record<string, unknown> | null; expiresAt: number } = {
  value: null,
  expiresAt: 0,
};

export function invalidateSecretCache(): void {
  cache = { value: null, expiresAt: 0 };
}

export async function getSecret(): Promise<Record<string, unknown> | null> {
  if (cache.value !== null && Date.now() < cache.expiresAt) return cache.value;
  const raw = await readRawSecret();
  const value =
    raw?.[SECRET_KEY] && typeof raw[SECRET_KEY] === "object"
      ? (raw[SECRET_KEY] as Record<string, unknown>)
      : {};
  cache = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}

export async function putSecret(value: Record<string, unknown>): Promise<void> {
  const raw = await readRawSecret();
  await writeRawSecret({ ...raw, [SECRET_KEY]: value });
  cache = { value, expiresAt: Date.now() + TTL_MS };
}
