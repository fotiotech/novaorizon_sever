import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface ISettingAddress {
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface ISettingSocialLinks {
  facebook: string;
  instagram: string;
  twitter: string;
  tiktok: string;
  youtube: string;
}

export interface ISetting {
  key: string;
  storeName: string;
  storeTagline: string;
  storeDescription: string;
  contactEmail: string;
  contactPhone: string;
  supportEmail: string;
  address: ISettingAddress;
  currency: string;
  currencySymbol: string;
  timezone: string;
  language: string;
  orderPrefix: string;
  lowStockThreshold: number;
  maintenanceMode: boolean;
  logoUrl: string;
  faviconUrl: string;
  socialLinks: ISettingSocialLinks;
  businessHours: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SettingModel = Model<ISetting>;
export type SettingDoc = HydratedDocument<ISetting>;

const SettingSchema = new Schema<ISetting, SettingModel>(
  {
    key: { type: String, required: true, unique: true, default: "general" },

    storeName: { type: String, default: "" },
    storeTagline: { type: String, default: "" },
    storeDescription: { type: String, default: "" },

    contactEmail: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    supportEmail: { type: String, default: "" },

    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      region: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      country: { type: String, default: "" },
    },

    currency: { type: String, default: "XAF" },
    currencySymbol: { type: String, default: "CFA" },
    timezone: { type: String, default: "Africa/Douala" },
    language: { type: String, default: "en" },

    orderPrefix: { type: String, default: "ORD" },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    maintenanceMode: { type: Boolean, default: false },

    logoUrl: { type: String, default: "" },
    faviconUrl: { type: String, default: "" },

    socialLinks: {
      facebook: { type: String, default: "" },
      instagram: { type: String, default: "" },
      twitter: { type: String, default: "" },
      tiktok: { type: String, default: "" },
      youtube: { type: String, default: "" },
    },

    businessHours: { type: String, default: "" },
  },
  { timestamps: true },
);

const Setting: SettingModel =
  (mongoose.models.Setting as SettingModel | undefined) ??
  (mongoose.model("Setting", SettingSchema) as unknown as SettingModel);

export default Setting;
