import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type EventType =
  | "view"
  | "cart_add"
  | "purchase"
  | "like"
  | "unlike"
  | "share"
  | "page_view";

export type EventDevice = "mobile" | "tablet" | "desktop" | "unknown";

export interface IEventContext {
  userAgent?: string;
  referrer?: string;
  country?: string;
  device?: EventDevice;
  locale?: string;
}

export interface IEvent {
  userId: string;
  itemId?: Types.ObjectId | null;
  eventType: EventType;
  score: number;
  sessionId?: string | null;
  metadata?: Record<string, any>;
  timestamp: Date;
  isBot: boolean;
  idempotencyKey?: string | null;
  context?: IEventContext | null;
}

export type EventModel = Model<IEvent>;
export type EventDoc = HydratedDocument<IEvent>;

const EventSchema = new Schema<IEvent, EventModel>(
  {
    userId: { type: String, required: true, index: true },
    itemId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: false,
      index: true,
      default: null,
    },
    eventType: {
      type: String,
      enum: [
        "view",
        "cart_add",
        "purchase",
        "like",
        "unlike",
        "share",
        "page_view",
      ],
      required: true,
    },
    score: { type: Number, default: 1 },
    sessionId: { type: String, index: true, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
    isBot: { type: Boolean, default: false, index: true },
    idempotencyKey: { type: String, sparse: true, unique: true, default: null },
    context: {
      userAgent: String,
      referrer: String,
      country: String,
      device: {
        type: String,
        enum: ["mobile", "tablet", "desktop", "unknown"],
      },
      locale: String,
    },
  },
  { timestamps: false },
);

EventSchema.index({ userId: 1, itemId: 1 });
EventSchema.index({ userId: 1, eventType: 1 });
EventSchema.index({ isBot: 1, timestamp: -1 });
EventSchema.index({ isBot: 1, eventType: 1, timestamp: -1 });
EventSchema.index({ isBot: 1, itemId: 1, timestamp: -1 });
EventSchema.index({ itemId: 1, eventType: 1, timestamp: -1 });
EventSchema.index({ userId: 1, itemId: 1, eventType: 1, timestamp: -1 });

const Event: EventModel =
  (mongoose.models.Event as EventModel | undefined) ??
  (mongoose.model("Event", EventSchema) as unknown as EventModel);

export { Event };
export default Event;
