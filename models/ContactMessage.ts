import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export type ContactMessageStatus = "new" | "read" | "replied" | "archived";

export interface IContactMessage {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  status: ContactMessageStatus;
  userId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContactMessageModel = Model<IContactMessage>;
export type ContactMessageDoc = HydratedDocument<IContactMessage>;

const ContactMessageSchema = new Schema<IContactMessage, ContactMessageModel>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: null },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["new", "read", "replied", "archived"],
      default: "new",
      index: true,
    },
    userId: { type: String, default: null },
  },
  { timestamps: true },
);

const ContactMessage: ContactMessageModel =
  (mongoose.models.ContactMessage as ContactMessageModel | undefined) ??
  (mongoose.model(
    "ContactMessage",
    ContactMessageSchema,
  ) as unknown as ContactMessageModel);

export default ContactMessage;
