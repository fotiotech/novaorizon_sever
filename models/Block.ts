import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";
import {
  BLOCK_LOCATIONS,
  BLOCK_DISPLAYS,
  BLOCK_SOURCE_TYPES,
  PROMOTION_MODES,
  BLOCK_REF_MODELS,
  BLOCK_THEMES,
  BLOCK_ANIMATIONS,
  BLOCK_ALIGNMENTS,
  CTA_STYLES,
  CARD_SHAPES,
  CARD_RATIOS,
  CARD_SIZES,
  CARD_LAYOUTS,
  TITLE_POSITIONS,
  IMAGE_POSITIONS,
  MAX_BLOCK_LIMIT,
} from "../config/content.constants.js";

export interface IManualRef {
  refModel: (typeof BLOCK_REF_MODELS)[number];
  refId: Types.ObjectId;
}

export interface IBlockHeading {
  title: string;
  subtitle: string;
  showHeading: boolean;
}

/**
 * Presentation is scoped: only the fields the current display/source can use
 * are stored. See `config/block-presentation.ts` for the field matrix.
 */
export interface IBlockPresentation {
  common: Record<string, any>;
  display: Record<string, any>;
  source: Record<string, any>;
}

export interface IBlockDisplayConfig {
  theme: (typeof BLOCK_THEMES)[number];
  columns: number;
  gap: number;
  borderless: boolean;
  rounded: boolean;
  shadow: boolean;
  alignment: (typeof BLOCK_ALIGNMENTS)[number];
  animation: (typeof BLOCK_ANIMATIONS)[number];
  cardShape: (typeof CARD_SHAPES)[number];
  cardRatio: (typeof CARD_RATIOS)[number];
  cardSize: (typeof CARD_SIZES)[number];
  cardLayout: (typeof CARD_LAYOUTS)[number];
  titlePosition: (typeof TITLE_POSITIONS)[number];
  imagePosition: (typeof IMAGE_POSITIONS)[number];
  backgroundColor: string;
  textColor: string;
}

export interface IBlockSourceStyles {
  promotionBadgeStyle: string;
  promotionShowCode: boolean;
  collectionShowItemCount: boolean;
  collectionCountPosition: string;
  manualCardSize: string;
  manualCardVariant: string;
  manualShowDescription: boolean;
}

export interface IBlockCta {
  text: string;
  link: string;
  style: (typeof CTA_STYLES)[number];
}

export interface IBlockSource {
  type: (typeof BLOCK_SOURCE_TYPES)[number];
  collectionId?: Types.ObjectId | null;
  categoryId?: Types.ObjectId | null;
  promotionId?: Types.ObjectId | null;
  bannerIds: Types.ObjectId[];
  promotionMode: (typeof PROMOTION_MODES)[number];
  items: IManualRef[];
}

export interface IBlock {
  name: string;
  location: (typeof BLOCK_LOCATIONS)[number];
  display: (typeof BLOCK_DISPLAYS)[number];
  source: IBlockSource;
  heading: IBlockHeading;
  presentation: IBlockPresentation;
  /**
   * @deprecated Legacy flat presentation, only present on rows created before
   * the per-display/source split. Reads fall back to it; writes unset it.
   */
  displayConfig?: Partial<IBlockDisplayConfig>;
  /** @deprecated see `displayConfig`. */
  sourceStyles?: Partial<IBlockSourceStyles>;
  cta: IBlockCta;
  limit: number;
  status: "active" | "inactive";
  order: number;
  created_at?: Date;
  updated_at?: Date;
}

export type BlockModel = Model<IBlock>;
export type BlockDoc = HydratedDocument<IBlock>;

const ManualRefSchema = new Schema(
  {
    refModel: { type: String, enum: BLOCK_REF_MODELS, required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);

const HeadingSchema = new Schema(
  {
    title: { type: String, default: "", trim: true },
    subtitle: { type: String, default: "", trim: true },
    showHeading: { type: Boolean, default: true },
  },
  { _id: false },
);



const CtaSchema = new Schema(
  {
    text: { type: String, default: "", trim: true },
    link: { type: String, default: "", trim: true },
    style: { type: String, enum: CTA_STYLES, default: "none" },
  },
  { _id: false },
);

const SourceSchema = new Schema(
  {
    type: { type: String, enum: BLOCK_SOURCE_TYPES, required: true },
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: "Collection",
      default: null,
    },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    promotionId: {
      type: Schema.Types.ObjectId,
      ref: "Promotion",
      default: null,
    },
    bannerIds: [{ type: Schema.Types.ObjectId, ref: "BannerContent" }],
    promotionMode: { type: String, enum: PROMOTION_MODES, default: "products" },
    items: { type: [ManualRefSchema], default: [] },
  },
  { _id: false },
);

const BlockSchema = new Schema<IBlock, BlockModel>(
  {
    name: { type: String, required: [true, "Name is required"], trim: true },
    location: {
      type: String,
      enum: BLOCK_LOCATIONS,
      required: true,
      index: true,
    },
    display: { type: String, enum: BLOCK_DISPLAYS, default: "grid" },
    source: { type: SourceSchema, required: true },
    heading: { type: HeadingSchema, default: () => ({}) },
    presentation: {
      common: { type: Schema.Types.Mixed, default: () => ({}) },
      display: { type: Schema.Types.Mixed, default: () => ({}) },
      source: { type: Schema.Types.Mixed, default: () => ({}) },
    },
    cta: { type: CtaSchema, default: () => ({}) },
    limit: { type: Number, default: 12, min: 1, max: MAX_BLOCK_LIMIT },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    order: { type: Number, default: 0, min: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

BlockSchema.pre("validate", function (this: IBlock) {
  const t = this.source?.type;
  if (!t) throw new Error("A content source is required.");
  if (t === "banner") {
    const ids = this.source.bannerIds ?? [];
    if (!ids.length)
      throw new Error("Banner source requires at least one bannerId.");
  }
});

BlockSchema.index({ location: 1, status: 1, order: 1 });
BlockSchema.index({ "source.collectionId": 1 });
BlockSchema.index({ "source.categoryId": 1 });
BlockSchema.index({ "source.promotionId": 1 });
BlockSchema.index({ "source.bannerIds": 1 });

const Block: BlockModel =
  (mongoose.models.Block as BlockModel | undefined) ??
  (mongoose.model("Block", BlockSchema) as unknown as BlockModel);

export { Block };
export default Block;