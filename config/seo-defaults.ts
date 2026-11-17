export type RobotsValue = "index,follow" | "noindex,nofollow";

export const DEFAULT_ROBOTS: RobotsValue = "index,follow";

export interface SeoForm {
  siteName: string;
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  ogImage: string;
  robots: RobotsValue;
}

/** TODO: replace with the real DEFAULT_SEO from `app/lib/seo-defaults`. */
export const DEFAULT_SEO: SeoForm = {
  siteName: "Novaorizon",
  title: "",
  description: "",
  keywords: "",
  canonicalUrl: "",
  ogImage: "",
  robots: "index,follow",
};
