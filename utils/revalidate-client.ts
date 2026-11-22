import { env } from "../config/env.js";

/**
 * Purges a tagged Next.js cache entry in the storefront after content changes.
 *
 * The API cannot reach Next's cache directly, so it calls the storefront's
 * `POST /api/revalidate` endpoint with a shared secret.
 */
export async function revalidateClientTags(tags: string[]): Promise<void> {
  const unique = [...new Set(tags.filter(Boolean))];
  if (unique.length === 0) return;

  const secret = env.revalidateSecret;
  const base = (env.frontendUrl ?? "")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");

  if (!secret || !base) return;

  try {
    const res = await fetch(`${base}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tags: unique }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.error(
        `[revalidate] ${unique.join(",")} failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
  } catch (err) {
    console.error(`[revalidate] ${unique.join(",")} request failed:`, err);
  }
}

/** Convenience wrapper for a single tag. */
export function revalidateClientTag(tag: string): Promise<void> {
  return revalidateClientTags([tag]);
}