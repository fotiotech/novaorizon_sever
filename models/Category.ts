import mongoose, { Schema, Types, HydratedDocument } from "mongoose";

/* ------------------------------- Interfaces ------------------------------- */

export interface ICategory {
  slug: string;
  name: string;
  parentId?: Types.ObjectId | null;
  description?: string | null;
  imageUrl: string[];

  inheritProperty: boolean;
  property?: Types.ObjectId | null;

  seoTitle?: string | null;
  seoDesc?: string | null;
  keywords?: string | null;
  sortOrder?: number | null;
  status: "active" | "inactive";

  createdAt: Date;
  updatedAt: Date;
}

export type CategoryModel = mongoose.Model<ICategory>;
export type CategoryDoc = HydratedDocument<ICategory>;

/* --------------------------------- Schema --------------------------------- */

const CategorySchema = new Schema<ICategory, CategoryModel>(
  {
    slug: {
      type: String,
      required: [true, "URL slug is required"],
    },
    name: {
      type: String,
      required: [true, "Category name is required"],
    },

    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    description: { type: String, maxlength: 500, default: null },
    imageUrl: {
      type: [
        {
          type: String,
          validate: {
            validator: (v: string) => /^https?:\/\/.+\..+$/.test(v),
            message: (props: { value: string }) =>
              `${props.value} is not a valid URL!`,
          },
        },
      ],
      default: [],
    },

    inheritProperty: { type: Boolean, default: true },

    property: {
      type: Schema.Types.ObjectId,
      ref: "CategoryProperty",
      default: null,
    },

    seoTitle: { type: String, maxlength: 60, default: null },
    seoDesc: { type: String, maxlength: 160, default: null },
    keywords: { type: String, default: null },
    sortOrder: { type: Number, default: null },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    // Replaces the original manual `updatedAt` pre-save hook, which only
    // fired on `.save()` and was bypassed by `.findOneAndUpdate(...)`.
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, any>) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(_doc, ret: Record<string, any>) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

/* --------------------------------- Indexes -------------------------------- */

CategorySchema.index({ parentId: 1, sortOrder: 1, name: 1 });
CategorySchema.index({ slug: 1 }, { unique: true });
CategorySchema.index({ status: 1 });

/* --------------------------------- Model ---------------------------------- */

const Category: CategoryModel =
  (mongoose.models.Category as CategoryModel | undefined) ??
  (mongoose.model(
    "Category",
    CategorySchema as any,
  ) as unknown as CategoryModel);

export default Category;