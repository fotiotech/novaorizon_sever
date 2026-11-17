import mongoose, { Schema, Model, HydratedDocument } from "mongoose";
import { BADGE_ICON_VALUES, isValidBadgeLink } from "../utils/trust-badges.js";

export interface ITrustBadgeDoc {
  name: string;
  icon: (typeof BADGE_ICON_VALUES)[number];
  title: string;
  description: string;
  popupText: string;
  link: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TrustBadgeModel = Model<ITrustBadgeDoc>;
export type TrustBadgeDocTyped = HydratedDocument<ITrustBadgeDoc>;

const TrustBadgeSchema = new Schema<ITrustBadgeDoc, TrustBadgeModel>(
  {
    name: {
      type: String,
      required: [true, "Internal name is required"],
      trim: true,
      maxlength: 80,
    },
    icon: {
      type: String,
      required: [true, "Icon is required"],
      enum: {
        values: BADGE_ICON_VALUES as unknown as string[],
        message: "Unknown icon",
      },
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: 60,
    },
    description: { type: String, default: "", trim: true, maxlength: 160 },
    popupText: { type: String, default: "", trim: true, maxlength: 600 },
    link: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: (v: string) => isValidBadgeLink(v),
        message: "Link must be a valid URL or start with /",
      },
    },
    // NOTE: `index: true` on both fields PLUS the compound index below is
    // three indexes where one would do. If you want to slim the index set,
    // remove the per-field `index: true` and keep the compound one.
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
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

TrustBadgeSchema.index({ isActive: 1, sortOrder: 1 });

const TrustBadge: TrustBadgeModel =
  (mongoose.models.TrustBadge as TrustBadgeModel | undefined) ??
  (mongoose.model(
    "TrustBadge",
    TrustBadgeSchema,
  ) as unknown as TrustBadgeModel);

export default TrustBadge;
