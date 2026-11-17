/**
 * Port of the `isValidBadgeLink` validator from `lib/trust/badgeIcons`.
 * Accepts: empty string, absolute URL (http/https/ftp/mailto/tel),
 * or relative path starting with "/".
 */
export function isValidBadgeLink(v: string): boolean {
  if (!v || v.trim() === "") return true;
  if (v.startsWith("/")) return true;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

/**
 * TODO: replace with the real BADGE_ICON_VALUES from `lib/trust/badgeIcons`.
 * Every value here is a stable identifier that admin UIs store on badge docs.
 * If your real list uses different keys, update this before running any writes.
 */
export const BADGE_ICON_VALUES = [
  "shield",
  "shield-check",
  "lock",
  "truck",
  "refresh",
  "credit-card",
  "wallet",
  "support",
  "headphones",
  "check-circle",
  "star",
  "award",
  "badge-check",
  "verified",
  "clock",
  "phone",
  "mail",
  "globe",
  "package",
  "thumbs-up",
] as const;

export type BadgeIconValue = (typeof BADGE_ICON_VALUES)[number];
