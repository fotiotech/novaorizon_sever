import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export type UserEventType = "view" | "click" | "add_to_cart" | "purchase";

export interface IUserEvent {
  user_id: string;
  product_id: string;
  event_type: UserEventType;
  timestamp: Date;
  device?: "mobile" | "desktop" | "tablet" | null;
  location?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserEventModel = Model<IUserEvent>;
export type UserEventDoc = HydratedDocument<IUserEvent>;

const UserEventSchema = new Schema<IUserEvent, UserEventModel>(
  {
    user_id: { type: String, required: true, index: true },
    product_id: { type: String, required: true, index: true },
    event_type: {
      type: String,
      enum: ["view", "click", "add_to_cart", "purchase"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    device: {
      type: String,
      enum: ["mobile", "desktop", "tablet"],
      default: null,
    },
    location: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

UserEventSchema.index({ user_id: 1, product_id: 1, event_type: 1 });
// Added: the original omitted this, so "all purchases in the last 24h"
// queries scan the whole collection. Keep it if you run those analytics.
UserEventSchema.index({ event_type: 1, timestamp: -1 });

/**
 * NOTE (fixed vs. original): the original called `model<IUserEvent>(...)`
 * WITHOUT the `mongoose.models.UserEvent ||` guard. Under `tsx watch` that
 * throws `OverwriteModelError: Cannot overwrite UserEvent model once
 * compiled` on every hot-reload, and under any second import in prod it
 * throws the same. Fixed with the standard guard.
 */
const UserEvent: UserEventModel =
  (mongoose.models.UserEvent as UserEventModel | undefined) ??
  (mongoose.model("UserEvent", UserEventSchema) as unknown as UserEventModel);

export default UserEvent;
