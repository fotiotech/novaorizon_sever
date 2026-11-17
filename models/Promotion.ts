import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export interface IPromotionProperty {
  _id?: Types.ObjectId;
  code: string;
  name: string;
  description?: string | null;
  type:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "multi-select"
    | "checkbox"
    | "radio"
    | "boolean"
    | "date"
    | "color"
    | "file"
    | "url";
  isRequired: boolean;
  isMultiple: boolean;
  options: string[];
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  } | null;
  sortOrder: number;
}

export type PromotionCalculationType =
  | "percentage"
  | "fixed_amount"
  | "buy_x_get_y"
  | "free_shipping"
  | "bundle_discount";

export interface IPromotionType {
  name: string;
  code?: string | null;
  description?: string | null;
  calculationType: PromotionCalculationType;
  properties: IPromotionProperty[];
  isActive: boolean;
  icon?: string | null;
}

export interface IPromotionScope {
  appliesTo: "all" | "products" | "categories" | "brands";
  productIds: Types.ObjectId[];
  categoryIds: Types.ObjectId[];
  brandIds: Types.ObjectId[];
  excludeProductIds: Types.ObjectId[];
}

export interface IPromotion {
  promotionType: IPromotionType;
  scope: IPromotionScope;
  propertyValues: Map<string, any>;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  code?: string | null;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  priority: number;
  customerEligibility: {
    allCustomers: boolean;
    customerGroupIds: Types.ObjectId[];
    minOrderAmount: number;
  };
  usageLimits: {
    totalUses?: number | null;
    perCustomer?: number | null;
    perOrder: number;
  };
  stackable: boolean;
  exclusiveWith: Types.ObjectId[];
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PromotionModel = Model<IPromotion>;
export type PromotionDoc = HydratedDocument<IPromotion>;

const PromotionPropertySchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },
    type: {
      type: String,
      enum: [
        "text",
        "textarea",
        "number",
        "select",
        "multi-select",
        "checkbox",
        "radio",
        "boolean",
        "date",
        "color",
        "file",
        "url",
      ],
      required: true,
    },
    isRequired: { type: Boolean, default: false },
    isMultiple: { type: Boolean, default: false },
    options: { type: [String], default: [] },
    defaultValue: { type: Schema.Types.Mixed, default: null },
    validation: {
      min: Number,
      max: Number,
      pattern: String,
      minLength: Number,
      maxLength: Number,
    },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true },
);

const PromotionTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },
    calculationType: {
      type: String,
      enum: [
        "percentage",
        "fixed_amount",
        "buy_x_get_y",
        "free_shipping",
        "bundle_discount",
      ],
      required: true,
    },
    properties: { type: [PromotionPropertySchema], default: [] },
    isActive: { type: Boolean, default: true },
    icon: { type: String, trim: true, default: null },
  },
  { _id: false },
);

const PromotionScopeSchema = new Schema(
  {
    appliesTo: {
      type: String,
      enum: ["all", "products", "categories", "brands"],
      default: "all",
    },
    productIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    brandIds: [{ type: Schema.Types.ObjectId, ref: "Brand" }],
    excludeProductIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
  },
  { _id: false },
);

const PromotionSchema = new Schema<IPromotion, PromotionModel>(
  {
    promotionType: { type: PromotionTypeSchema, required: true },
    scope: { type: PromotionScopeSchema, default: () => ({}) },
    propertyValues: { type: Map, of: Schema.Types.Mixed, default: {} },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },
    imageUrl: { type: String, trim: true, default: null },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      default: null,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    customerEligibility: {
      allCustomers: { type: Boolean, default: true },
      customerGroupIds: [{ type: Schema.Types.ObjectId, ref: "CustomerGroup" }],
      minOrderAmount: { type: Number, default: 0 },
    },
    usageLimits: {
      totalUses: { type: Number, default: null },
      perCustomer: { type: Number, default: null },
      perOrder: { type: Number, default: 1 },
    },
    stackable: { type: Boolean, default: false },
    exclusiveWith: [{ type: Schema.Types.ObjectId, ref: "Promotion" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

PromotionSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
PromotionSchema.index({ "promotionType.calculationType": 1 });
PromotionSchema.index({ "scope.appliesTo": 1, "scope.productIds": 1 });
PromotionSchema.index({ "scope.appliesTo": 1, "scope.categoryIds": 1 });
PromotionSchema.index({ "scope.appliesTo": 1, "scope.brandIds": 1 });

const Promotion: PromotionModel =
  (mongoose.models.Promotion as PromotionModel | undefined) ??
  (mongoose.model("Promotion", PromotionSchema) as unknown as PromotionModel);

export { Promotion };
export default Promotion;
