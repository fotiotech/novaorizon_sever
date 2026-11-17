import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export type FacebookDefaultObjective =
  | "sales"
  | "leads"
  | "traffic"
  | "awareness"
  | "engagement"
  | "catalog_sales";

export interface IFacebookAdsSettings {
  key: string;
  accessToken?: string | null;
  adAccountId?: string | null;
  catalogId?: string | null;
  pageId?: string | null;
  apiVersion?: string | null;
  defaultObjective?: FacebookDefaultObjective | null;
  createdAt: Date;
  updatedAt: Date;
}

export type FacebookAdsSettingsModel = Model<IFacebookAdsSettings>;
export type FacebookAdsSettingsDoc = HydratedDocument<IFacebookAdsSettings>;

const FacebookAdsSettingsSchema = new Schema<
  IFacebookAdsSettings,
  FacebookAdsSettingsModel
>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "facebook-ads",
    },
    accessToken: { type: String, default: null, select: false }, // never in JSON by default
    adAccountId: { type: String, default: null },
    catalogId: { type: String, default: null },
    pageId: { type: String, default: null },
    apiVersion: { type: String, default: "v20.0" },
    defaultObjective: { type: String, default: "sales" },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, any>) {
        delete ret.__v;
        delete ret.accessToken;
        return ret;
      },
    },
  },
);

const FacebookAdsSettings: FacebookAdsSettingsModel =
  (mongoose.models.FacebookAdsSettings as
    | FacebookAdsSettingsModel
    | undefined) ??
  (mongoose.model(
    "FacebookAdsSettings",
    FacebookAdsSettingsSchema,
  ) as unknown as FacebookAdsSettingsModel);

export default FacebookAdsSettings;
