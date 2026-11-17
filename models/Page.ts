import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type PageStatus = "draft" | "review" | "published" | "archived";

export interface IPage {
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  featuredImage?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  status: PageStatus;
  publishedAt?: Date | null;
  author?: Types.ObjectId | null;
  tags?: string[];
  category?: string;
  views?: number;
  isFeatured?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PageModel = Model<IPage>;
export type PageDoc = HydratedDocument<IPage>;

const PageSchema = new Schema<IPage, PageModel>(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [120, "Title cannot exceed 120 characters"],
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: [100, "Slug too long"],
    },
    excerpt: {
      type: String,
      maxlength: [300, "Excerpt cannot exceed 300 characters"],
      default: "",
    },
    content: { type: String, default: "" },
    featuredImage: { type: String, default: "" },
    metaTitle: {
      type: String,
      maxlength: [60, "Meta title should be under 60 characters"],
      default: "",
    },
    metaDescription: {
      type: String,
      maxlength: [160, "Meta description should be under 160 characters"],
      default: "",
    },
    metaKeywords: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["draft", "review", "published", "archived"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null },
    author: { type: Schema.Types.ObjectId, ref: "User", default: null },
    tags: { type: [String], default: [] },
    category: { type: String, default: "" },
    views: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false, index: true },
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

PageSchema.pre("save", function (this: PageDoc) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  if (
    this.isModified("status") &&
    this.status === "published" &&
    !this.publishedAt
  ) {
    this.publishedAt = new Date();
  }
});

PageSchema.index({ status: 1, publishedAt: -1 });

const Page: PageModel =
  (mongoose.models.Page as PageModel | undefined) ??
  (mongoose.model("Page", PageSchema) as unknown as PageModel);

export default Page;
