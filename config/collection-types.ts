export const TARGET_TYPES = [
  "Product",
  "Category",
  "Brand",
  "Promotion",
  "Collection",
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const CARD_SHAPES = ["default", "circle"] as const;
export type CardShape = (typeof CARD_SHAPES)[number];

export const CTA_STYLES = ["none", "link", "button"] as const;
export type CtaStyle = (typeof CTA_STYLES)[number];

export const VALUE_TYPES = ["string", "number", "boolean", "date"] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const COLLECTION_TYPES = ["rule", "manual", "recommendation"] as const;
export type CollectionType = (typeof COLLECTION_TYPES)[number];

export const COLLECTION_MANUAL_LIMIT = 50;
export const COLLECTION_LIST_PATH = "/catalog/collections";