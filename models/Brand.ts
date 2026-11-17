import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface IBrand {
  url_slug?: string | null;
  name: string;
  logoUrl?: string | null;
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

export type BrandModel = Model<IBrand>;
export type BrandDoc = HydratedDocument<IBrand>;

const BrandSchema = new Schema<IBrand, BrandModel>(
  {
    url_slug: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },
    name: {
      type: String,
      required: [true, "Brand name is required"],
      unique: true,
    },
    logoUrl: {
      type: String,
      validate: {
        validator: (v: string) => !v || /^https?:\/\/.+\..+$/.test(v),
        message: "Invalid URL format",
      },
      unique: true,
      sparse: true,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, any>) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

const Brand: BrandModel =
  (mongoose.models.Brand as BrandModel | undefined) ??
  (mongoose.model("Brand", BrandSchema) as unknown as BrandModel);

export default Brand;
