import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type MessageChannel = "email" | "sms";

export interface IMessageTemplate {
  name: string;
  channel: MessageChannel;
  subject?: string | null;
  previewText?: string | null;
  body: string;
  variables: string[];
  isActive: boolean;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageTemplateModel = Model<IMessageTemplate>;
export type MessageTemplateDoc = HydratedDocument<IMessageTemplate>;

const MessageTemplateSchema = new Schema<
  IMessageTemplate,
  MessageTemplateModel
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
    previewText: { type: String, trim: true, maxlength: 200, default: null },
    body: { type: String, required: true, default: "" },
    variables: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

MessageTemplateSchema.index({ channel: 1, isActive: 1, createdAt: -1 });

const MessageTemplate: MessageTemplateModel =
  (mongoose.models.MessageTemplate as MessageTemplateModel | undefined) ??
  (mongoose.model(
    "MessageTemplate",
    MessageTemplateSchema,
  ) as unknown as MessageTemplateModel);

export { MessageTemplate };
export default MessageTemplate;
