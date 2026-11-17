import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface IDraft {
  userId: string;
  productId: string;
  data: any;
  createdAt: Date;
  updatedAt: Date;
}

export type DraftModel = Model<IDraft>;
export type DraftDoc = HydratedDocument<IDraft>;

const DraftSchema = new Schema<IDraft, DraftModel>(
  {
    userId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

DraftSchema.index({ userId: 1, productId: 1 }, { unique: true });

const Draft: DraftModel =
  (mongoose.models.Draft as DraftModel | undefined) ??
  (mongoose.model("Draft", DraftSchema) as unknown as DraftModel);

export default Draft;
