import mongoose, { Schema, Types, Model } from "mongoose";

export type ProductStatus = "draft" | "active" | "inactive";

export interface IProductCode {
  type: "EAN" | "UPC" | "ISBN" | "QR" | "MODEL";
  value: string;
}

export interface IVariant {
  attributes?: Record<string, any>;
  sku?: string;
  price?: number;
  quantity?: number;
  mainImage?: string;
  images?: string[];
  [key: string]: any;
}

export interface IReview {
  _id?: Types.ObjectId;
  user: Types.ObjectId | { _id: Types.ObjectId; name: string };
  rating: number;
  comment?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IRelatedProduct {
  product: Types.ObjectId;
  relationshipType?: string;
}

/**
 * Strict interface (no `[key: string]: any`, no `extends Document`).
 * Dynamic category attributes still get stored because the schema runs
 * `strict: false` and reads go through a `serialize()` helper that
 * returns `any`. This keeps mongoose 9's typed Schema happy.
 */
export interface IProduct {
  productCode: IProductCode | null;
  name: string;
  name_autocomplete: string;
  sku: string;
  slug: string;
  categoryId: Types.ObjectId;
  brand: Types.ObjectId;
  categoryName: string;
  brandName: string;
  hasVariants: boolean;
  variantThemes: string[];
  variantValues: Record<string, string[]>;
  quantity: number;
  lowStockThreshold: number;
  listPrice: number;
  price: number;
  images: string[];
  description: string;
  shortDescription: string;
  variants: IVariant[];
  carrier?: Types.ObjectId | null;
  relatedProducts: IRelatedProduct[];
  reviewsRatings: IReview[];
  tags: string[];
  status: ProductStatus;

  isFeatured: boolean;
  isBestseller: boolean;
  bestsellerRank: number;
  isTrending: boolean;
  trendingRank: number;
  newArrival: boolean;
  metricsUpdatedAt?: Date;

  embedding: number[];
  embeddingText: string;
  embeddingModel: string;
  embeddedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type ProductModel = Model<IProduct>;

const ProductCodeSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["EAN", "UPC", "ISBN", "QR", "MODEL"],
      required: true,
    },
    value: { type: String, required: true },
  },
  { _id: false },
);

const ReviewSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 1000 },
  },
  { _id: true, timestamps: true },
);

const ProductSchema = new Schema(
  {
    productCode: { type: ProductCodeSchema, default: null },
    name: { type: String, trim: true, default: "" },
    name_autocomplete: { type: String, trim: true, default: "" },
    sku: { type: String, trim: true, default: "" },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      unique: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    brand: { type: Schema.Types.ObjectId, ref: "Brand", required: true },
    categoryName: { type: String, trim: true, default: "" },
    brandName: { type: String, trim: true, default: "" },
    hasVariants: { type: Boolean, default: false },
    variantThemes: { type: [String], default: [] },
    variantValues: { type: Schema.Types.Mixed, default: {} },
    quantity: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    listPrice: { type: Number, default: 0, min: 0 },
    price: { type: Number, default: 0, min: 0 },
    images: { type: [String], default: [] },
    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },
    variants: { type: [Schema.Types.Mixed], default: [] },
    carrier: { type: Schema.Types.ObjectId, ref: "Carrier", default: null },
    relatedProducts: {
      type: [
        {
          _id: false,
          product: { type: Schema.Types.ObjectId, ref: "Product" },
          relationshipType: { type: String },
        },
      ],
      default: [],
    },
    reviewsRatings: { type: [ReviewSchema], default: [] },
    tags: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["draft", "active", "inactive"],
      default: "draft",
      index: true,
    },

    isFeatured: { type: Boolean, default: false, index: true },
    isBestseller: { type: Boolean, default: false, index: true },
    bestsellerRank: { type: Number, default: 0 },
    isTrending: { type: Boolean, default: false, index: true },
    trendingRank: { type: Number, default: 0 },
    newArrival: { type: Boolean, default: false, index: true },
    metricsUpdatedAt: { type: Date, default: null },

    embedding: { type: [Number], default: [] },
    embeddingText: { type: String, default: "" },
    embeddingModel: { type: String, default: "" },
    embeddedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    strict: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, any>) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

ProductSchema.pre("save", function (this: any) {
  if (this.isModified("name") || !this.name_autocomplete) {
    this.name_autocomplete = this.name;
  }
});

ProductSchema.pre("findOneAndUpdate", function (this: any) {
  const update = this.getUpdate() as any;
  const newName = update?.name ?? update?.$set?.name;
  if (newName) {
    if (update.$set) update.$set.name_autocomplete = newName;
    else update.name_autocomplete = newName;
  }
});

ProductSchema.index({ slug: 1 }, { unique: true });
ProductSchema.index({ sku: 1 });
ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ status: 1, categoryId: 1, createdAt: -1 });
ProductSchema.index({ status: 1, categoryId: 1, price: 1 });
ProductSchema.index({ status: 1, categoryId: 1, color: 1, price: 1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ isTrending: 1, trendingRank: 1 });
ProductSchema.index({ isBestseller: 1, bestsellerRank: 1 });
ProductSchema.index({ isFeatured: 1, createdAt: -1 });
ProductSchema.index({ newArrival: 1, createdAt: -1 });

const Product: ProductModel =
  (mongoose.models.Product as ProductModel | undefined) ??
  (mongoose.model("Product", ProductSchema) as unknown as ProductModel);

export default Product;
