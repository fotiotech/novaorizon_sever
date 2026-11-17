import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";
import { isValidBadgeLink } from "../utils/trust-badges.js";

export interface ITrustBadge {
  badgeId?: Types.ObjectId | null;
  icon: string;
  title: string;
  description?: string;
  popupText?: string;
  link?: string;
}

export interface IHeroContent {
  title: string;
  description: string;
  imageUrl: string;
  cta_text: string;
  cta_link: string;
  trustBadges: ITrustBadge[];
  created_at: Date;
  updated_at: Date;
}

export type HeroContentModel = Model<IHeroContent>;
export type HeroContentDoc = HydratedDocument<IHeroContent>;

const TrustBadgeSchema = new Schema(
  {
    badgeId: { type: Schema.Types.ObjectId, ref: "TrustBadge", default: null },
    icon: {
      type: String,
      required: [true, "Badge icon is required"],
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Badge title is required"],
      trim: true,
    },
    description: { type: String, default: "", trim: true },
    popupText: { type: String, default: "", trim: true },
    link: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: (v: string) => isValidBadgeLink(v),
        message: "Link must be a valid URL or start with /",
      },
    },
  },
  { _id: false },
);

const HeroContentSchema = new Schema<IHeroContent, HeroContentModel>({
  title: {
    type: String,
    required: [true, "Title is required"],
  },
  description: {
    type: String,
    required: [true, "Description is required"],
  },
  imageUrl: {
    type: String,
    required: [true, "At least one image is required"],
  },
  cta_text: {
    type: String,
    required: [true, "CTA text is required"],
  },
  cta_link: {
    type: String,
    required: [true, "CTA link is required"],
    validate: {
      validator: function (v: string) {
        return /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/.test(v);
      },
      message: "Invalid URL format",
    },
  },
  trustBadges: {
    type: [TrustBadgeSchema],
    default: [],
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

HeroContentSchema.pre("save", function (this: IHeroContent) {
  this.updated_at = new Date();
});

const HeroContent: HeroContentModel =
  (mongoose.models.HeroContent as HeroContentModel | undefined) ??
  (mongoose.model(
    "HeroContent",
    HeroContentSchema,
  ) as unknown as HeroContentModel);

export default HeroContent;
