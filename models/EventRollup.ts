import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type RollupEventType =
  | "view"
  | "cart_add"
  | "purchase"
  | "like"
  | "page_view";

export interface IEventRollup {
  bucket: Date;
  eventType: RollupEventType;
  itemId: Types.ObjectId | null;
  count: number;
  totalScore: number;
  uniqueUsers: string[];
}

export type EventRollupModel = Model<IEventRollup>;
export type EventRollupDoc = HydratedDocument<IEventRollup>;

const EventRollupSchema = new Schema<IEventRollup, EventRollupModel>({
  bucket: { type: Date, required: true },
  eventType: { type: String, required: true },
  itemId: { type: Schema.Types.ObjectId, default: null },
  count: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  uniqueUsers: { type: [String], default: [] },
});

// NOTE (preserved from original): Mongo treats `null` as a value for unique
// indexes. Two rollups with `{bucket, eventType}` matching but `itemId: null`
// will collide on this index. If you want to allow multiple null-itemId rows
// per bucket+type, replace with a partial filter expression.
EventRollupSchema.index(
  { bucket: 1, eventType: 1, itemId: 1 },
  { unique: true },
);
EventRollupSchema.index({ bucket: 1, itemId: 1 });
EventRollupSchema.index({ bucket: 1, eventType: 1 });

const EventRollup: EventRollupModel =
  (mongoose.models.EventRollup as EventRollupModel | undefined) ??
  (mongoose.model(
    "EventRollup",
    EventRollupSchema,
  ) as unknown as EventRollupModel);

export { EventRollup };
export default EventRollup;
