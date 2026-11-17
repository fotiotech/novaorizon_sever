import mongoose, { Schema, Model, HydratedDocument } from "mongoose";
import { CTA_STYLES } from "../config/content.constants.js";

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
  name: string;
  eyebrow: string;
  body: string;
  heading: IBannerHeading;
  image: string;
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
    name: { type: String, required: [true, "Name is required"], trim: true },
    eyebrow: { type: String, default: "", trim: true },
    body: { type: String, default: "" },
    heading: { type: HeadingSchema, default: () => ({}) },
    image: { type: String, default: "" },
    cta: { type: CtaSchema, default: () => ({}) },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

BannerContentSchema.pre("validate", function (this: IBannerContent) {
  const hasAnyContent =
    Boolean(this.heading?.title) || Boolean(this.body) || Boolean(this.image);
  if (!hasAnyContent) {
    throw new Error(
      "Banner needs at least a headline, body, or image to be usable.",
    );
  }
});

BannerContentSchema.index({ name: 1 });

const BannerContent: BannerContentModel =
  (mongoose.models.BannerContent as BannerContentModel | undefined) ??
  (mongoose.model(
    "BannerContent",
    BannerContentSchema,
  ) as unknown as BannerContentModel);

export { BannerContent };
export default BannerContent;
