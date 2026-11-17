import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface IAttributeSet {
  title: string;
  code: string;
  description?: string;
  sortOrder?: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AttributeSetModel = Model<IAttributeSet>;
export type AttributeSetDoc = HydratedDocument<IAttributeSet>;

const AttributeSetSchema = new Schema<IAttributeSet, AttributeSetModel>(
  {
    title: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: [true, "Code is required"],
      unique: true,
      trim: true,
    },
    description: { type: String, required: false, default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const AttributeSet: AttributeSetModel =
  (mongoose.models.AttributeSet as AttributeSetModel | undefined) ??
  (mongoose.model(
    "AttributeSet",
    AttributeSetSchema as any,
  ) as unknown as AttributeSetModel);

export default AttributeSet;
