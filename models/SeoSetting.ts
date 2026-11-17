import mongoose, { Schema, Model, HydratedDocument } from "mongoose";
import type { RobotsValue } from "../config/seo-defaults.js";

export interface ISeoSetting {
  key: string;
  siteName: string;
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  ogImage: string;
  robots: RobotsValue;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SeoSettingModel = Model<ISeoSetting>;
export type SeoSettingDoc = HydratedDocument<ISeoSetting>;

const SeoSettingSchema = new Schema<ISeoSetting, SeoSettingModel>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    siteName: { type: String, default: "" },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    keywords: { type: String, default: "" },
    canonicalUrl: { type: String, default: "" },
    ogImage: { type: String, default: "" },
    robots: {
      type: String,
      enum: ["index,follow", "noindex,nofollow"],
      default: "index,follow",
    },
  },
  { timestamps: true },
);

const SeoSetting: SeoSettingModel =
  (mongoose.models.SeoSetting as SeoSettingModel | undefined) ??
  (mongoose.model(
    "SeoSetting",
    SeoSettingSchema,
  ) as unknown as SeoSettingModel);

export default SeoSetting;
