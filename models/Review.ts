import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export interface IReview {
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  rating: number;
  reviewText: string;
  mediaUrl: string[];
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ReviewModel = Model<IReview>;
export type ReviewDoc = HydratedDocument<IReview>;

const ReviewSchema = new Schema<IReview, ReviewModel>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: { type: Number, min: 1, max: 5, required: true },
    reviewText: { type: String, required: true },
    mediaUrl: { type: [String], default: [] },
    helpfulCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// One review per user per product.
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
ReviewSchema.index({ productId: 1, rating: -1, createdAt: -1 });

const Review: ReviewModel =
  (mongoose.models.Review as ReviewModel | undefined) ??
  (mongoose.model("Review", ReviewSchema) as unknown as ReviewModel);

export { Review };
export default Review;
