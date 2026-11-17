import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export interface IPromotionUsage {
  promotionId: Types.ObjectId;
  customerId?: Types.ObjectId | null;
  orderId: Types.ObjectId;
  discountAmount: number;
  code?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PromotionUsageModel = Model<IPromotionUsage>;
export type PromotionUsageDoc = HydratedDocument<IPromotionUsage>;

const PromotionUsageSchema = new Schema<IPromotionUsage, PromotionUsageModel>(
  {
    promotionId: {
      type: Schema.Types.ObjectId,
      ref: "Promotion",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    discountAmount: { type: Number, required: true, min: 0 },
    code: { type: String, trim: true, uppercase: true, default: null },
  },
  { timestamps: true },
);

PromotionUsageSchema.index({ promotionId: 1, orderId: 1 }, { unique: true });

const PromotionUsage: PromotionUsageModel =
  (mongoose.models.PromotionUsage as PromotionUsageModel | undefined) ??
  (mongoose.model(
    "PromotionUsage",
    PromotionUsageSchema,
  ) as unknown as PromotionUsageModel);

export { PromotionUsage };
export default PromotionUsage;
