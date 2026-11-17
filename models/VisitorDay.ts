import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface IVisitorDay {
  day: string;
  userId: string;
  firstSeenAt: Date;
}

export type VisitorDayModel = Model<IVisitorDay>;
export type VisitorDayDoc = HydratedDocument<IVisitorDay>;

const VisitorDaySchema = new Schema<IVisitorDay, VisitorDayModel>({
  day: { type: String, required: true },
  userId: { type: String, required: true },
  firstSeenAt: { type: Date, default: Date.now },
});

VisitorDaySchema.index({ day: 1, userId: 1 }, { unique: true });
VisitorDaySchema.index({ userId: 1, day: 1 });

// NOTE (preserved from original): no TTL — this collection grows unbounded.
// If it's used for analytics only, consider a TTL index on `firstSeenAt`
// (e.g. 90 days) so old rows fall off automatically:
//
//   VisitorDaySchema.index({ firstSeenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
//
// Left out for now to match the original behaviour.

const VisitorDay: VisitorDayModel =
  (mongoose.models.VisitorDay as VisitorDayModel | undefined) ??
  (mongoose.model(
    "VisitorDay",
    VisitorDaySchema,
  ) as unknown as VisitorDayModel);

export { VisitorDay };
export default VisitorDay;
