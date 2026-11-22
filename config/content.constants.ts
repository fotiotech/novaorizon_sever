/* -------------------------------------------------------------------------- */
/*                   Re-exports from `collection-types.ts`                    */
/*                                                                            */
/* `content.constants.ts` acts as the single barrel for content-related       */
/* constants. Anything imported from `collection-types.ts` must be            */
/* re-exported here for downstream modules to consume it via this file.      */
/*                                                                            */
/* Missing re-exports here caused "does not provide an export named           */
/* 'COLLECTION_TYPES'" at runtime — NodeNext ESM requires every symbol       */
/* to be explicitly re-exported, no auto-fallthrough.                        */
/* -------------------------------------------------------------------------- */

export {
  CARD_SHAPES,
  CTA_STYLES,
  TARGET_TYPES,
  COLLECTION_TYPES,
  COLLECTION_MANUAL_LIMIT,
  COLLECTION_LIST_PATH,
  VALUE_TYPES,
} from "./collection-types.js";

export type {
  CardShape,
  CtaStyle,
  TargetType,
  CollectionType,
  ValueType,
} from "./collection-types.js";

/* -------------------------------------------------------------------------- */
/*                               Block locations                              */
/* -------------------------------------------------------------------------- */

export const BLOCK_LOCATIONS = ["Home", "ProductRelated"] as const;
export type BlockLocation = (typeof BLOCK_LOCATIONS)[number];

export const BLOCK_SOURCE_TYPES = [
  "collection",
  "category",
  "promotion",
  "manual",
] as const;
export type BlockSourceType = (typeof BLOCK_SOURCE_TYPES)[number];

export const PROMOTION_MODES = ["products", "self"] as const;
export type PromotionMode = (typeof PROMOTION_MODES)[number];

export const BLOCK_REF_MODELS = [
  "Category",
  "Product",
  "Collection",
  "Brand",
  "Promotion",
  "Page",
] as const;
export type BlockRefModel = (typeof BLOCK_REF_MODELS)[number];

export const BLOCK_DISPLAYS = [
  "grid",
  "carousel",
  "list",
  "hero",
  "slides",
  "bento",
  "masonry",
] as const;
export type BlockDisplay = (typeof BLOCK_DISPLAYS)[number];

export const BLOCK_COLUMN_COUNTS = [1, 2, 3, 4, 5, 6] as const;

export const BLOCK_THEMES = ["light", "dark", "inherit"] as const;
export type BlockTheme = (typeof BLOCK_THEMES)[number];

export const BLOCK_ANIMATIONS = ["none", "fade", "slide", "scale"] as const;
export type BlockAnimation = (typeof BLOCK_ANIMATIONS)[number];

export const BLOCK_ALIGNMENTS = ["start", "center", "end", "stretch"] as const;
export type BlockAlignment = (typeof BLOCK_ALIGNMENTS)[number];

export const CARD_RATIOS = [
  "9:21",
  "1:2",
  "9:16",
  "2:3",
  "3:4",
  "4:5",
  "1:1",
  "5:4",
  "4:3",
  "3:2",
  "16:9",
  "2:1",
  "21:9",
] as const;
export type CardRatio = (typeof CARD_RATIOS)[number];

export const TITLE_POSITIONS = [
  "below",
  "overlay-bottom",
  "overlay-top",
  "hidden",
] as const;
export type TitlePosition = (typeof TITLE_POSITIONS)[number];

export const IMAGE_POSITIONS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
] as const;
export type ImagePosition = (typeof IMAGE_POSITIONS)[number];

export const CARD_SIZES = ["sm", "md", "lg"] as const;
export type CardSize = (typeof CARD_SIZES)[number];

export const CARD_VARIANTS = ["card", "bare"] as const;
export type CardVariant = (typeof CARD_VARIANTS)[number];

/** Card rendering style, independent of the display layout. */
export const BLOCK_CARD_STYLES = ["default", "tile"] as const;
export type BlockCardStyle = (typeof BLOCK_CARD_STYLES)[number];

export const CARD_LAYOUTS = ["stacked", "image-left", "image-right"] as const;
export type CardLayout = (typeof CARD_LAYOUTS)[number];

export const DEFAULT_BLOCK_LIMIT = 12;
export const MAX_BLOCK_LIMIT = 60;

/* -------------------------------------------------------------------------- */
/*                             Display configuration                          */
/* -------------------------------------------------------------------------- */

import type { CardShape } from "./collection-types.js";

export interface BlockDisplayConfig {
  theme: BlockTheme;
  columns: number;
  gap: number;
  borderless: boolean;
  rounded: boolean;
  shadow: boolean;
  alignment: BlockAlignment;
  animation: BlockAnimation;
  cardShape: CardShape;
  cardRatio: CardRatio;
  cardSize: CardSize;
  cardStyle: BlockCardStyle;
  cardLayout: CardLayout;
  titlePosition: TitlePosition;
  imagePosition: ImagePosition;
  backgroundColor: string;
  textColor: string;
}

export const DEFAULT_BLOCK_DISPLAY_CONFIG: BlockDisplayConfig = {
  theme: "inherit",
  columns: 4,
  gap: 16,
  borderless: false,
  rounded: true,
  shadow: false,
  alignment: "start",
  animation: "fade",
  cardShape: "default",
  cardRatio: "1:1",
  cardSize: "md",
  cardStyle: "default",
  cardLayout: "stacked",
  titlePosition: "below",
  imagePosition: "center",
  backgroundColor: "",
  textColor: "",
};

/* -------------------------------------------------------------------------- */
/*                          Source-specific display                           */
/* -------------------------------------------------------------------------- */

export const PROMOTION_BADGE_STYLES = [
  "default",
  "code",
  "countdown",
  "none",
] as const;
export type PromotionBadgeStyle = (typeof PROMOTION_BADGE_STYLES)[number];

export const COLLECTION_COUNT_POSITIONS = ["none", "subline", "badge"] as const;
export type CollectionCountPosition =
  (typeof COLLECTION_COUNT_POSITIONS)[number];

export interface BlockSourceStyles {
  promotionBadgeStyle: PromotionBadgeStyle;
  promotionShowCode: boolean;
  collectionShowItemCount: boolean;
  collectionCountPosition: CollectionCountPosition;
  manualCardSize: CardSize;
  manualCardVariant: CardVariant;
  manualShowDescription: boolean;
}

export const DEFAULT_BLOCK_SOURCE_STYLES: BlockSourceStyles = {
  promotionBadgeStyle: "default",
  promotionShowCode: true,
  collectionShowItemCount: false,
  collectionCountPosition: "subline",
  manualCardSize: "md",
  manualCardVariant: "card",
  manualShowDescription: true,
};