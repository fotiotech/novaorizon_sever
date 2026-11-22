import { env } from "../config/env.js";

/**
 * Purges a tagged Next.js cache entry in the storefront after content changes.
 *
 * The API cannot reach Next's cache directly, so it calls the storefront's
 * `POST /api/revalidate` endpoint with a shared secret.
 */
export async function revalidateClientTag(tag: string): Promise<void> {
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
      body: JSON.stringify({ tag }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.error(
        `[revalidate] ${tag} failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
  } catch (err) {
    console.error(`[revalidate] ${tag} request failed:`, err);
  }
}
