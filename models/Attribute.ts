import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type AttributeType =
  | "text"
  | "select"
  | "checkbox"
  | "radio"
  | "boolean"
  | "textarea"
  | "number"
  | "date"
  | "color"
  | "file"
  | "url"
  | "multi-select";

export interface IAttribute {
  code: string;
  unitFamily?: Types.ObjectId | null;
  isRequired?: boolean;
  name: string;
  sortOrder: number;
  option?: string[];
  type: AttributeType;
}

export type AttributeModel = Model<IAttribute>;
export type AttributeDoc = HydratedDocument<IAttribute>;

const AttributeSchema = new Schema<IAttribute, AttributeModel>(
  {
    code: {
      type: String,
      unique: true,
      required: [true, "Attribute code is required"],
    },
    unitFamily: {
      type: Schema.Types.ObjectId,
      ref: "UnitFamily",
      default: null,
    },
    isRequired: { type: Boolean, default: false },
    name: {
      type: String,
      unique: true,
      required: [true, "Attribute name is required"],
    },
    sortOrder: {
      type: Number,
      required: [true, "Attribute sortOrder is required"],
    },
    option: { type: [String], default: [] },
    type: {
      type: String,
      enum: [
        "text",
        "select",
        "checkbox",
        "radio",
        "boolean",
        "textarea",
        "number",
        "date",
        "color",
        "file",
        "url",
        "multi-select",
      ],
      required: true,
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

const Attribute: AttributeModel =
  (mongoose.models.Attribute as AttributeModel | undefined) ??
  (mongoose.model(
    "Attribute",
    AttributeSchema as any,
  ) as unknown as AttributeModel);

export default Attribute;
