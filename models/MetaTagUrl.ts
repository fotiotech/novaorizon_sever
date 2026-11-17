import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export type ChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface IMetaTagUrl {
  url: string;
  urlPattern?: string | null;
  title: string;
  description: string;
  keywords?: string[];
  canonicalUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  ogType?: string;
  twitterCard?: string;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  twitterImage?: string | null;
  robots?: string;
  priority: number;
  changeFrequency: ChangeFrequency;
  isActive: boolean;
  lastModified: Date;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type MetaTagUrlModel = Model<IMetaTagUrl>;
export type MetaTagUrlDoc = HydratedDocument<IMetaTagUrl>;

const MetaTagUrlSchema = new Schema<IMetaTagUrl, MetaTagUrlModel>(
  {
    url: { type: String, required: true, trim: true },
    urlPattern: { type: String, trim: true, default: null },
    title: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, required: true, trim: true, maxlength: 160 },
    keywords: { type: [String], default: [] },
    canonicalUrl: { type: String, trim: true, default: null },
    ogTitle: { type: String, trim: true, maxlength: 60, default: null },
    ogDescription: { type: String, trim: true, maxlength: 160, default: null },
    ogImage: { type: String, trim: true, default: null },
    ogType: {
      type: String,
      enum: ["website", "article", "product", "profile", "video"],
      default: "website",
    },
    twitterCard: {
      type: String,
      enum: ["summary", "summary_large_image", "app", "player"],
      default: "summary_large_image",
    },
    twitterTitle: { type: String, trim: true, maxlength: 60, default: null },
    twitterDescription: {
      type: String,
      trim: true,
      maxlength: 160,
      default: null,
    },
    twitterImage: { type: String, trim: true, default: null },
    robots: {
      type: String,
      enum: [
        "index, follow",
        "noindex, follow",
        "index, nofollow",
        "noindex, nofollow",
      ],
      default: "index, follow",
    },
    priority: { type: Number, min: 0, max: 1, default: 0.5 },
    changeFrequency: {
      type: String,
      enum: [
        "always",
        "hourly",
        "daily",
        "weekly",
        "monthly",
        "yearly",
        "never",
      ],
      default: "weekly",
    },
    isActive: { type: Boolean, default: true },
    lastModified: { type: Date, default: Date.now },
    createdBy: { type: String, required: true, default: "admin" },
  },
  { timestamps: true },
);

MetaTagUrlSchema.index({ url: 1 }, { unique: true });
MetaTagUrlSchema.index({ isActive: 1 });
MetaTagUrlSchema.index({ createdAt: -1 });
MetaTagUrlSchema.index({ urlPattern: 1 });

const MetaTagUrl: MetaTagUrlModel =
  (mongoose.models.MetaTagUrl as MetaTagUrlModel | undefined) ??
  (mongoose.model(
    "MetaTagUrl",
    MetaTagUrlSchema,
  ) as unknown as MetaTagUrlModel);

export default MetaTagUrl;
