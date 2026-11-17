// utils/draft-keys.ts

export const NEW_PRODUCT_DRAFT_KEY = "new-product-draft-id";

type BrowserGlobals = typeof globalThis & {
  window?: unknown;
  sessionStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  crypto: { randomUUID(): string };
};

/**
 * Returns a stable draft key for the current browser session.
 *
 * - On the server (Node): always returns the default key. The backend
 *   uses `NEW_PRODUCT_DRAFT_KEY` as the fallback whenever `recreateProduct`
 *   is called without an explicit `draftKey` in the body.
 * - In the browser: reuses the session-scoped key or mints a fresh UUID
 *   prefixed with `new-` so multiple new-product tabs don't collide.
 *
 * The `typeof window === "undefined"` guard keeps this safe to *import*
 * on the backend — calling it in Node returns the default constant
 * rather than throwing `ReferenceError: sessionStorage is not defined`.
 */
export function getOrCreateNewProductDraftKey(): string {
  const browser = globalThis as BrowserGlobals;
  if (!browser.window) return NEW_PRODUCT_DRAFT_KEY;

  const existing = browser.sessionStorage.getItem(NEW_PRODUCT_DRAFT_KEY);
  if (existing) return existing;

  const fresh = `new-${browser.crypto.randomUUID()}`;
  browser.sessionStorage.setItem(NEW_PRODUCT_DRAFT_KEY, fresh);
  return fresh;
}

/**
 * Drops the draft key from sessionStorage after the product has been
 * saved (or the user abandons the form). No-op on the server.
 */
export function clearNewProductDraftKey(): void {
  const browser = globalThis as BrowserGlobals;
  if (!browser.window) return;
  browser.sessionStorage.removeItem(NEW_PRODUCT_DRAFT_KEY);
}
