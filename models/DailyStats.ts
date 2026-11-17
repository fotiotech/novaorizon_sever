import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface IDailyStatsEventCounts {
  view: number;
  cart_add: number;
  purchase: number;
  like: number;
  page_view: number;
}

export interface IDailyStats {
  day: string;
  visitors: number;
  newVisitors: number;
  returningVisitors: number;
  events: number;
  eventCounts: IDailyStatsEventCounts;
  revenue: number;
  createdAt: Date;
  updatedAt: Date;
}

export type DailyStatsModel = Model<IDailyStats>;
export type DailyStatsDoc = HydratedDocument<IDailyStats>;

const DailyStatsSchema = new Schema<IDailyStats, DailyStatsModel>(
  {
    day: { type: String, required: true, unique: true },
    visitors: { type: Number, default: 0 },
    newVisitors: { type: Number, default: 0 },
    returningVisitors: { type: Number, default: 0 },
    events: { type: Number, default: 0 },
    eventCounts: {
      view: { type: Number, default: 0 },
      cart_add: { type: Number, default: 0 },
      purchase: { type: Number, default: 0 },
      like: { type: Number, default: 0 },
      page_view: { type: Number, default: 0 },
    },
    revenue: { type: Number, default: 0 },
  },
  { timestamps: true },
);

DailyStatsSchema.index({ day: -1 });

const DailyStats: DailyStatsModel =
  (mongoose.models.DailyStats as DailyStatsModel | undefined) ??
  (mongoose.model(
    "DailyStats",
    DailyStatsSchema,
  ) as unknown as DailyStatsModel);

export { DailyStats };
export default DailyStats;
