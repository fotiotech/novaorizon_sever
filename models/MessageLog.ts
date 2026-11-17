import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type MessageChannel = "email" | "sms";
export type LogStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "failed"
  | "complained";

export interface IMessageLog {
  campaignId: Types.ObjectId;
  channel: MessageChannel;
  recipient: string;
  subscriberId?: Types.ObjectId | null;
  status: LogStatus;
  providerMessageId?: string | null;
  providerName?: string | null;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  openedAt?: Date | null;
  clickedAt?: Date | null;
  bouncedAt?: Date | null;
  failedAt?: Date | null;
  error?: string | null;
  lastClickedUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageLogModel = Model<IMessageLog>;
export type MessageLogDoc = HydratedDocument<IMessageLog>;

const MessageLogSchema = new Schema<IMessageLog, MessageLogModel>(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "MessageCampaign",
      required: true,
      index: true,
    },
    channel: { type: String, enum: ["email", "sms"], required: true },
    recipient: { type: String, required: true, trim: true, index: true },
    subscriberId: {
      type: Schema.Types.ObjectId,
      ref: "NewsletterSubscriber",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "queued",
        "sent",
        "delivered",
        "opened",
        "clicked",
        "bounced",
        "failed",
        "complained",
      ],
      default: "queued",
      index: true,
    },
    providerMessageId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    providerName: { type: String, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    clickedAt: { type: Date, default: null },
    bouncedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    error: { type: String, default: null },
    lastClickedUrl: { type: String, default: null },
  },
  { timestamps: true },
);

MessageLogSchema.index({ campaignId: 1, recipient: 1 }, { unique: true });
MessageLogSchema.index({ campaignId: 1, status: 1 });
MessageLogSchema.index({ campaignId: 1, createdAt: -1 });

const MessageLog: MessageLogModel =
  (mongoose.models.MessageLog as MessageLogModel | undefined) ??
  (mongoose.model(
    "MessageLog",
    MessageLogSchema,
  ) as unknown as MessageLogModel);

export { MessageLog };
export default MessageLog;
