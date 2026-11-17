import mongoose, { Schema, HydratedDocument } from "mongoose";

/**
 * TODO: the original `models/CategoryPropertyDraft.ts` was not provided.
 * This stub exposes only the fields the actions actually read/write:
 *   key, userId, version, data, savedAt
 * When you send the real model, replace this file.
 */
export interface ICategoryPropertyDraft {
  key: string;
  userId?: string | null;
  version: number;
  data: any;
  savedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CategoryPropertyDraftModel = mongoose.Model<ICategoryPropertyDraft>;
export type CategoryPropertyDraftDoc = HydratedDocument<ICategoryPropertyDraft>;

const CategoryPropertyDraftSchema = new Schema<
  ICategoryPropertyDraft,
  CategoryPropertyDraftModel
>(
  {
    key: { type: String, required: true },
    userId: { type: String, default: null },
    version: { type: Number, required: true, default: 1 },
    data: { type: Schema.Types.Mixed, required: true },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

CategoryPropertyDraftSchema.index({ key: 1, userId: 1 }, { unique: true });

const CategoryPropertyDraft: CategoryPropertyDraftModel =
  (mongoose.models.CategoryPropertyDraft as
    | CategoryPropertyDraftModel
    | undefined) ??
  (mongoose.model(
    "CategoryPropertyDraft",
    CategoryPropertyDraftSchema as any,
  ) as unknown as CategoryPropertyDraftModel);

export default CategoryPropertyDraft;
