import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type OfferType =
  | "percentage"
  | "fixed"
  | "bogo"
  | "free_shipping"
  | "bundle";

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
  conditions: IOfferConditions;
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
