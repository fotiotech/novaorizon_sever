import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";
import {
  TARGET_TYPES,
  DISPLAY_LAYOUTS,
  CARD_SHAPES,
  CTA_STYLES,
  COLLECTION_TYPES,
  DEFAULT_COLLECTION_DISPLAY,
  type TargetType,
} from "../config/content.constants.js";

export interface ICollectionRule {
  attribute: string;
  operator: "$in" | "$nin" | "$eq" | "$ne" | "$lt" | "$lte" | "$gt" | "$gte";
  value: any;
  position: number;
}

export interface ICollectionDisplay {
  layout: (typeof DISPLAY_LAYOUTS)[number];
  columns: number;
  gap: number;
  showImages: boolean;
  cardShape: (typeof CARD_SHAPES)[number];
}

export interface ICollectionSort {
  field?: string;
  direction: "asc" | "desc";
}

export interface ICollection {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  type: (typeof COLLECTION_TYPES)[number];
  targetType: TargetType;
  recommendationType?: "personalized" | "recentlyViewed" | null;
  recommendationLimit?: number;
  items: Types.ObjectId[];
  rules: ICollectionRule[];
  sort?: ICollectionSort | null;
  display: ICollectionDisplay;
  ctaText?: string | null;
  ctaLink?: string | null;
  ctaStyle: (typeof CTA_STYLES)[number];
  status: "active" | "inactive";
  order: number;
  showName: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export type CollectionModel = Model<ICollection>;
export type CollectionDoc = HydratedDocument<ICollection>;

const RuleSchema = new Schema(
  {
    attribute: { type: String, required: true },
    operator: {
      type: String,
      enum: ["$in", "$nin", "$eq", "$ne", "$lt", "$lte", "$gt", "$gte"],
      required: true,
    },
    value: { type: Schema.Types.Mixed, required: true },
    position: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const DisplaySchema = new Schema(
  {
    layout: {
      type: String,
      enum: DISPLAY_LAYOUTS,
      default: DEFAULT_COLLECTION_DISPLAY.layout,
    },
    columns: {
      type: Number,
      default: DEFAULT_COLLECTION_DISPLAY.columns,
      min: 1,
      max: 6,
    },
    gap: {
      type: Number,
      default: DEFAULT_COLLECTION_DISPLAY.gap,
      min: 0,
      max: 64,
    },
    showImages: {
      type: Boolean,
      default: DEFAULT_COLLECTION_DISPLAY.showImages,
    },
    cardShape: {
      type: String,
      enum: CARD_SHAPES,
      default: DEFAULT_COLLECTION_DISPLAY.cardShape,
    },
  },
  { _id: false },
);

const SortSchema = new Schema(
  {
    field: { type: String },
    direction: { type: String, enum: ["asc", "desc"], default: "asc" },
  },
  { _id: false },
);

const CollectionSchema = new Schema<ICollection, CollectionModel>(
  {
    name: { type: String, required: true },
    description: { type: String, default: null },
    imageUrl: { type: String, default: null },

    type: { type: String, enum: COLLECTION_TYPES, default: "rule" },
    targetType: {
      type: String,
      enum: TARGET_TYPES,
      required: true,
      index: true,
    },

    recommendationType: {
      type: String,
      enum: ["personalized", "recentlyViewed"],
      default: null,
    },
    recommendationLimit: { type: Number, default: 10, min: 1, max: 100 },

    items: [{ type: Schema.Types.ObjectId, refPath: "targetType" }],
    rules: { type: [RuleSchema], default: [] },

    sort: { type: SortSchema, default: undefined },
    display: { type: DisplaySchema, default: () => ({}) },

    ctaText: { type: String, default: null },
    ctaLink: { type: String, default: null },
    ctaStyle: { type: String, enum: CTA_STYLES, default: "none" },

    status: { type: String, enum: ["active", "inactive"], default: "active" },
    order: { type: Number, default: 0, min: 0 },
    showName: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

CollectionSchema.pre("save", function (this: ICollection) {
  if (this.rules?.length) {
    this.rules.sort((a, b) => a.position - b.position);
  }
});

CollectionSchema.index({ targetType: 1, name: 1 }, { unique: true });
CollectionSchema.index({ status: 1, targetType: 1, order: 1 });
CollectionSchema.index({ "rules.attribute": 1 });

const Collection: CollectionModel =
  (mongoose.models.Collection as CollectionModel | undefined) ??
  (mongoose.model(
    "Collection",
    CollectionSchema,
  ) as unknown as CollectionModel);

export { Collection };
export default Collection;

export {
  TARGET_TYPES,
  DISPLAY_LAYOUTS,
  CARD_SHAPES,
  CTA_STYLES,
  COLLECTION_TYPES,
} from "../config/content.constants.js";
export type { TargetType } from "../config/content.constants.js";
