import mongoose, { Schema, Model, HydratedDocument } from "mongoose";
import {
  BANNER_ALIGNS,
  BANNER_CARD_SIZES,
  BANNER_RATIOS,
  BANNER_OVERLAYS,
  BANNER_POSITIONS,
  BANNER_STATUSES,
  BANNER_THEMES,
  BANNER_TYPES,
  CTA_STYLES,
} from "../config/content.constants.js";

export interface IBannerHeading {
  title: string;
  subtitle: string;
}

export interface IBannerCta {
  text: string;
  link: string;
  style: (typeof CTA_STYLES)[number];
}

export interface IBannerContent {
  /** How the banner renders: image background, video background, or raw HTML. */
  type: (typeof BANNER_TYPES)[number];
  name: string;
  eyebrow: string;
  body: string;
  heading: IBannerHeading;

  image: string;
  imageAlt: string;
  videoUrl: string;
  html: string;

  /** Whole-banner click-through (independent of the CTA button). */
  link: string;
  openInNewTab: boolean;

  overlay: (typeof BANNER_OVERLAYS)[number];
  /** Compact tile only: aspect ratio and relative size. */
  ratio: (typeof BANNER_RATIOS)[number];
  size: (typeof BANNER_CARD_SIZES)[number];
  align: (typeof BANNER_ALIGNS)[number];
  position: (typeof BANNER_POSITIONS)[number];
  theme: (typeof BANNER_THEMES)[number];

  status: (typeof BANNER_STATUSES)[number];
  order: number;
  /** Optional scheduling window; either side may be null. */
  startAt: Date | null;
  endAt: Date | null;

  cta: IBannerCta;
  created_at?: Date;
  updated_at?: Date;
}

export type BannerContentModel = Model<IBannerContent>;
export type BannerContentDoc = HydratedDocument<IBannerContent>;

const HeadingSchema = new Schema(
  {
    title: { type: String, default: "", trim: true },
    subtitle: { type: String, default: "", trim: true },
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

const BannerContentSchema = new Schema<IBannerContent, BannerContentModel>(
  {
    type: { type: String, enum: BANNER_TYPES, default: "image" },
    name: { type: String, required: [true, "Name is required"], trim: true },
    eyebrow: { type: String, default: "", trim: true },
    body: { type: String, default: "" },
    heading: { type: HeadingSchema, default: () => ({}) },

    image: { type: String, default: "" },
    imageAlt: { type: String, default: "", trim: true },
    videoUrl: { type: String, default: "", trim: true },
    html: { type: String, default: "" },

    link: { type: String, default: "", trim: true },
    openInNewTab: { type: Boolean, default: false },

    overlay: { type: String, enum: BANNER_OVERLAYS, default: "gradient" },
    ratio: { type: String, enum: BANNER_RATIOS, default: "1:1" },
    size: { type: String, enum: BANNER_CARD_SIZES, default: "md" },
    align: { type: String, enum: BANNER_ALIGNS, default: "left" },
    position: { type: String, enum: BANNER_POSITIONS, default: "center" },
    theme: { type: String, enum: BANNER_THEMES, default: "light" },

    status: { type: String, enum: BANNER_STATUSES, default: "active" },
    order: { type: Number, default: 0, min: 0 },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },

    cta: { type: CtaSchema, default: () => ({}) },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

BannerContentSchema.pre("validate", function (this: IBannerContent) {
  const type = this.type ?? "image";

  if (type === "image" && !this.image) {
    throw new Error("Image banners need a background image.");
  }
  if (type === "video" && !this.videoUrl) {
    throw new Error("Video banners need a video URL.");
  }
  if (type === "html" && !this.html) {
    throw new Error("HTML banners need their markup.");
  }
  if (type === "compact" && !this.image) {
    throw new Error("Compact banners need a logo image.");
  }
  if (type === "compact" && !this.heading?.title) {
    throw new Error("Compact banners need a title.");
  }

  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    throw new Error("The banner schedule ends before it starts.");
  }

  if (this.cta?.style && this.cta.style !== "none" && !this.cta.link) {
    throw new Error("CTA requires a link.");
  }
});

BannerContentSchema.index({ name: 1 });
BannerContentSchema.index({ status: 1, order: 1 });

const BannerContent: BannerContentModel =
  (mongoose.models.BannerContent as BannerContentModel | undefined) ??
  (mongoose.model(
    "BannerContent",
    BannerContentSchema,
  ) as unknown as BannerContentModel);

export { BannerContent };
export default BannerContent;