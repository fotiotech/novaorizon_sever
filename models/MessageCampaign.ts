import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type MessageChannel = "email" | "sms";
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "paused"
  | "failed"
  | "cancelled";

export interface CampaignAudience {
  status: "subscribed" | "unsubscribed" | "bounced" | "all";
  sources?: string[];
  joinedAfter?: Date | null;
  joinedBefore?: Date | null;
  includeEmails?: string[];
  excludeEmails?: string[];
}

export interface CampaignStats {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  unsubscribed: number;
}

export interface CampaignProgress {
  lastSubscriberId: string | null;
  processed: number;
  lastRunAt: Date | null;
  lastError: string | null;
}

export interface IMessageCampaign {
  name: string;
  channel: MessageChannel;
  subject?: string | null;
  previewText?: string | null;
  body: string;
  audience: CampaignAudience;
  status: CampaignStatus;
  scheduledFor?: Date | null;
  progress: CampaignProgress;
  stats: CampaignStats;
  templateId?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  sentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageCampaignModel = Model<IMessageCampaign>;
export type MessageCampaignDoc = HydratedDocument<IMessageCampaign>;

const CampaignAudienceSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["subscribed", "unsubscribed", "bounced", "all"],
      default: "subscribed",
    },
    sources: { type: [String], default: [] },
    joinedAfter: { type: Date, default: null },
    joinedBefore: { type: Date, default: null },
    includeEmails: { type: [String], default: [] },
    excludeEmails: { type: [String], default: [] },
  },
  { _id: false },
);

const CampaignStatsSchema = new Schema(
  {
    total: { type: Number, default: 0, min: 0 },
    queued: { type: Number, default: 0, min: 0 },
    sent: { type: Number, default: 0, min: 0 },
    delivered: { type: Number, default: 0, min: 0 },
    opened: { type: Number, default: 0, min: 0 },
    clicked: { type: Number, default: 0, min: 0 },
    bounced: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    unsubscribed: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const ProgressSchema = new Schema(
  {
    lastSubscriberId: { type: String, default: null },
    processed: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { _id: false },
);

const MessageCampaignSchema = new Schema<
  IMessageCampaign,
  MessageCampaignModel
>(
  {
    name: { type: String, required: true, trim: true },
    channel: {
      type: String,
      enum: ["email", "sms"],
      required: true,
      index: true,
    },
    subject: { type: String, trim: true, default: null },
    previewText: { type: String, trim: true, default: null },
    body: { type: String, required: true, default: "" },
    audience: {
      type: CampaignAudienceSchema,
      default: () => ({ status: "subscribed" }),
    },
    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "sending",
        "sent",
        "paused",
        "failed",
        "cancelled",
      ],
      default: "draft",
      index: true,
    },
    scheduledFor: { type: Date, default: null, index: true },
    progress: { type: ProgressSchema, default: () => ({}) },
    stats: { type: CampaignStatsSchema, default: () => ({}) },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "MessageTemplate",
      default: null,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

MessageCampaignSchema.index({ status: 1, createdAt: -1 });
MessageCampaignSchema.index({ status: 1, scheduledFor: 1 });

const MessageCampaign: MessageCampaignModel =
  (mongoose.models.MessageCampaign as MessageCampaignModel | undefined) ??
  (mongoose.model(
    "MessageCampaign",
    MessageCampaignSchema,
  ) as unknown as MessageCampaignModel);

export { MessageCampaign };
export default MessageCampaign;
