import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export type SitemapChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface ISitemapExcludedUrl {
  url?: string | null;
  pattern?: string | null;
  reason?: string | null;
  excludedAt: Date;
}

export interface ISitemapPrioritySettings {
  home: number;
  products: number;
  categories: number;
  blog: number;
  static: number;
}

export interface ISitemapSearchEnginePing {
  google: boolean;
  bing: boolean;
  other: boolean;
}

export interface ISitemapSettings {
  autoRegenerate: boolean;
  changeFrequency: SitemapChangeFrequency;
  prioritySettings: ISitemapPrioritySettings;
  excludedUrls: ISitemapExcludedUrl[];
  lastGenerated?: Date | null;
  urlsCount?: number | null;
  searchEnginePing: ISitemapSearchEnginePing;
  createdAt: Date;
  updatedAt: Date;
}

export type SitemapSettingsModel = Model<ISitemapSettings>;
export type SitemapSettingsDoc = HydratedDocument<ISitemapSettings>;

const SitemapSettingsSchema = new Schema<
  ISitemapSettings,
  SitemapSettingsModel
>(
  {
    autoRegenerate: { type: Boolean, default: true },
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
    prioritySettings: {
      home: { type: Number, default: 1.0, min: 0, max: 1 },
      products: { type: Number, default: 0.8, min: 0, max: 1 },
      categories: { type: Number, default: 0.7, min: 0, max: 1 },
      blog: { type: Number, default: 0.6, min: 0, max: 1 },
      static: { type: Number, default: 0.5, min: 0, max: 1 },
    },
    excludedUrls: [
      {
        _id: false,
        url: { type: String, default: null },
        pattern: { type: String, default: null },
        reason: { type: String, default: null },
        excludedAt: { type: Date, default: Date.now },
      },
    ],
    lastGenerated: { type: Date, default: null },
    urlsCount: { type: Number, default: null },
    searchEnginePing: {
      google: { type: Boolean, default: true },
      bing: { type: Boolean, default: true },
      other: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

const SitemapSettings: SitemapSettingsModel =
  (mongoose.models.SitemapSettings as SitemapSettingsModel | undefined) ??
  (mongoose.model(
    "SitemapSettings",
    SitemapSettingsSchema,
  ) as unknown as SitemapSettingsModel);

export default SitemapSettings;
