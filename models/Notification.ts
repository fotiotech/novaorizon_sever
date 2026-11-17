import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type NotificationType =
  | "order"
  | "payment"
  | "promotion"
  | "product"
  | "system";

export interface INotification {
  userId: Types.ObjectId;
  message: string;
  type: NotificationType;
  isRead: boolean;
  timestamp: Date;
}

export type NotificationModel = Model<INotification>;
export type NotificationDoc = HydratedDocument<INotification>;

const NotificationSchema = new Schema<INotification, NotificationModel>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ["order", "payment", "promotion", "product", "system"],
    default: "system",
    index: true,
  },
  isRead: { type: Boolean, default: false, index: true },
  timestamp: { type: Date, default: Date.now },
});

NotificationSchema.index({ isRead: 1, type: 1 });
NotificationSchema.index({ userId: 1, isRead: 1, timestamp: -1 });

const Notification: NotificationModel =
  (mongoose.models.Notification as NotificationModel | undefined) ??
  (mongoose.model(
    "Notification",
    NotificationSchema,
  ) as unknown as NotificationModel);

export default Notification;
