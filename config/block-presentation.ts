import {
  BLOCK_ALIGNMENTS,
  BLOCK_ANIMATIONS,
  BLOCK_DISPLAYS,
  BLOCK_SOURCE_TYPES,
  BLOCK_THEMES,
  CARD_RATIOS,
  CARD_SHAPES,
  CARD_SIZES,
  CARD_VARIANTS,
  COLLECTION_COUNT_POSITIONS,
  IMAGE_POSITIONS,
  PROMOTION_BADGE_STYLES,
  TITLE_POSITIONS,
  type BlockDisplay,
  type BlockSourceType,
} from "./content.constants.js";

/**
 * Presentation configuration, scoped by display type and source type.
 *
 * A block only stores the fields that its current `display` and `source.type`
 * can actually use. Everything else is dropped on write, which removes the old
 * situation where every block carried all 22 presentation fields whether the
 * renderer used them or not (a banner block had `cardShape`, a manual block
 * had `promotionShowCode`, …).
 *
 * Shape stored in Mongo and returned by the API:
 *
 *   presentation: {
 *     common:  { theme, gap, animation, backgroundColor, textColor },
 *     display: { …only the fields listed in DISPLAY_FIELDS[display] },
 *     source:  { …only the fields listed in SOURCE_FIELDS[sourceType] },
 *   }
 */

export const COMMON_FIELDS = [
  "theme",
  "gap",
  "animation",
  "backgroundColor",
  "textColor",
] as const;

/** Fields that only make sense for a given display. */
export const DISPLAY_FIELDS: Record<BlockDisplay, readonly string[]> = {
  grid: [
    "columns",
    "cardShape",
    "cardRatio",
    "cardSize",
    "cardStyle",
    "titlePosition",
    "imagePosition",
    "borderless",
    "rounded",
    "shadow",
    "alignment",
  ],
  carousel: [
    "cardShape",
    "cardRatio",
    "cardSize",
    "cardStyle",
    "titlePosition",
    "imagePosition",
    "borderless",
    "rounded",
    "shadow",
    "alignment",
  ],
  list: [
    "cardStyle",
    "titlePosition",
    "imagePosition",
    "borderless",
    "rounded",
    "shadow",
    "alignment",
  ],
  hero: [
    "alignment",
    "imagePosition",
    "titlePosition",
    "borderless",
    "rounded",
    "shadow",
  ],
  // Editorial carousels of collection/promotion/category tiles.
  slides: [
    "cardRatio",
    "titlePosition",
    "imagePosition",
    "borderless",
    "rounded",
    "shadow",
    "alignment",
  ],
  // Asymmetric "bento" grid: one hero tile plus supporting tiles.
  bento: [
    "titlePosition",
    "imagePosition",
    "borderless",
    "rounded",
    "shadow",
    "alignment",
  ],
  // Column-flow layout, best for product cards.
  masonry: [
    "columns",
    "cardRatio",
    "cardStyle",
    "titlePosition",
    "borderless",
    "rounded",
    "shadow",
    "alignment",
  ],
};

/** Fields that only make sense for a given source. */
export const SOURCE_FIELDS: Record<BlockSourceType, readonly string[]> = {
  // Card size/variant is a display concern (DISPLAY_FIELDS) — the source only
  // decides whether descriptions are shown on manual cards.
  manual: ["cardVariant", "showDescription"],
  collection: ["showItemCount", "countPosition"],
  promotion: ["badgeStyle", "showCode"],
  category: [],
};

/** Validators used when normalising a raw presentation payload. */
export const FIELD_RULES: Record<
  string,
  | { kind: "enum"; values: readonly string[]; fallback: string }
  | { kind: "number"; min: number; max: number; fallback: number }
  | { kind: "bool"; fallback: boolean }
  | { kind: "color"; fallback: string }
> = {
  theme: { kind: "enum", values: BLOCK_THEMES, fallback: "inherit" },
  animation: { kind: "enum", values: BLOCK_ANIMATIONS, fallback: "fade" },
  gap: { kind: "number", min: 0, max: 64, fallback: 16 },
  backgroundColor: { kind: "color", fallback: "" },
  textColor: { kind: "color", fallback: "" },

  columns: { kind: "number", min: 1, max: 6, fallback: 4 },
  alignment: { kind: "enum", values: BLOCK_ALIGNMENTS, fallback: "start" },
  cardShape: { kind: "enum", values: CARD_SHAPES, fallback: "default" },
  cardRatio: { kind: "enum", values: CARD_RATIOS, fallback: "1:1" },
  cardSize: { kind: "enum", values: CARD_SIZES, fallback: "md" },
  cardVariant: { kind: "enum", values: CARD_VARIANTS, fallback: "card" },
  titlePosition: {
    kind: "enum",
    values: TITLE_POSITIONS,
    fallback: "below",
  },
  imagePosition: {
    kind: "enum",
    values: IMAGE_POSITIONS,
    fallback: "center",
  },
  borderless: { kind: "bool", fallback: false },
  rounded: { kind: "bool", fallback: true },
  shadow: { kind: "bool", fallback: false },

  showDescription: { kind: "bool", fallback: true },
  showItemCount: { kind: "bool", fallback: false },
  countPosition: {
    kind: "enum",
    values: COLLECTION_COUNT_POSITIONS,
    fallback: "subline",
  },
  badgeStyle: {
    kind: "enum",
    values: PROMOTION_BADGE_STYLES,
    fallback: "default",
  },
  showCode: { kind: "bool", fallback: true },
};

/** Human labels, used by the admin editor to render only relevant controls. */
export const FIELD_LABELS: Record<string, string> = {
  theme: "Theme",
  gap: "Gap (px)",
  animation: "Animation",
  backgroundColor: "Background",
  textColor: "Text colour",
  columns: "Columns",
  alignment: "Alignment",
  cardShape: "Card shape",
  cardRatio: "Aspect ratio",
  cardSize: "Card size",
  cardVariant: "Card variant",
  titlePosition: "Title position",
  imagePosition: "Image position",
  borderless: "Borderless",
  rounded: "Rounded",
  shadow: "Shadow",
  showDescription: "Show description",
  showItemCount: "Show item count",
  countPosition: "Count position",
  badgeStyle: "Badge style",
  showCode: "Show code",
};

export const BLOCK_DISPLAY_KEYS = BLOCK_DISPLAYS;
export const BLOCK_SOURCE_KEYS = BLOCK_SOURCE_TYPES;