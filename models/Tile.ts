import mongoose, { Schema, type Model, type HydratedDocument } from "mongoose";

/**
 * A compact shortcut tile (logo + title) rendered below the storefront hero.
 * Tiles are standalone content, not a content-block presentation.
 */
export interface ITile {
  title: string;
  imageUrl?: string | null;
  link?: string | null;
  backgroundColor?: string | null;
  backgroundImage?: string | null;
  status: "active" | "inactive";
  order: number;
  created_at?: Date;
  updated_at?: Date;
}

export type TileDoc = HydratedDocument<ITile>;
export type TileModel = Model<ITile>;

const TileSchema = new Schema<ITile, TileModel>(
  {
    title: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: null, trim: true },
    link: { type: String, default: null, trim: true },
    backgroundColor: { type: String, default: null, trim: true },
    backgroundImage: { type: String, default: null, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    order: { type: Number, default: 0, min: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

TileSchema.index({ status: 1, order: 1 });

const Tile =
  (mongoose.models.Tile as TileModel) ||
  mongoose.model<ITile, TileModel>("Tile", TileSchema);

export default Tile;