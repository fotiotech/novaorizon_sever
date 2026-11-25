import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type OfferType =
  | "percentage"
  | "fixed"
  | "bogo"
  | "free_shipping"
  | "bundle";

export interface IOfferEligibility {
  productIds: Types.ObjectId[];
  categoryIds: Types.ObjectId[];
  brandIds: Types.ObjectId[];
  collectionIds: Types.ObjectId[];
  match: "all" | "any";
  rules: {
    field: string;
    operator: string;
    value: any;
  }[];
}

export interface IOfferConditions {
  minPurchaseAmount?: number;
  eligibleProducts: Types.ObjectId[];
  startDate: Date;
  endDate: Date;
}

export interface IOffer {
  name: string;
  description?: string | null;
  type: OfferType;
  discountValue?: number | null;
  /** BXGY configuration. */
  buyQuantity?: number | null;
  getQuantity?: number | null;
  /** Bundle configuration. */
  bundleQuantity?: number | null;
  conditions: IOfferConditions;
  /** Manual/ruled target set; replaces conditions.eligibleProducts over time. */
  eligibility?: IOfferEligibility;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type OfferModel = Model<IOffer>;
export type OfferDoc = HydratedDocument<IOffer>;

const OfferSchema = new Schema<IOffer, OfferModel>(
  {
    name: { type: String, required: true },
    description: { type: String, default: null },
    type: {
      type: String,
      enum: ["percentage", "fixed", "bogo", "free_shipping", "bundle"],
      required: true,
    },
    discountValue: { type: Number, default: null },
    buyQuantity: { type: Number, default: null, min: 1 },
    getQuantity: { type: Number, default: null, min: 1 },
    bundleQuantity: { type: Number, default: null, min: 1 },
    eligibility: {
      productIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
      categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
      brandIds: [{ type: Schema.Types.ObjectId, ref: "Brand" }],
      collectionIds: [{ type: Schema.Types.ObjectId, ref: "Collection" }],
      match: { type: String, enum: ["all", "any"], default: "all" },
      rules: [
        {
          field: { type: String, trim: true },
          operator: { type: String, default: "$eq" },
          value: { type: Schema.Types.Mixed, default: null },
        },
      ],
    },
    conditions: {
      minPurchaseAmount: { type: Number, default: null },
      eligibleProducts: [{ type: Schema.Types.ObjectId, ref: "Product" }],
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

OfferSchema.index({
  isActive: 1,
  "conditions.startDate": 1,
  "conditions.endDate": 1,
});

const Offer: OfferModel =
  (mongoose.models.Offer as OfferModel | undefined) ??
  (mongoose.model("Offer", OfferSchema) as unknown as OfferModel);

export default Offer;