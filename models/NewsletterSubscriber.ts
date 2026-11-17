import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type NewsletterStatus = "subscribed" | "unsubscribed" | "bounced";

export interface INewsletterSubscriber {
  email: string;
  status: NewsletterStatus;
  source: string;
  userId?: Types.ObjectId | null;
  // NOTE (preserved from original): `sparse: true` at the field level combined
  // with `default: null` makes the sparse flag useless — every doc has the
  // field so it's always indexed. If you want "unique non-null phones", remove
  // `default: null` and use a partial filter expression on the unique index.
  phone?: string | null;
  smsConsent?: boolean;
  unsubscribeToken: string;
  subscribedAt: Date;
  unsubscribedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewsletterSubscriberModel = Model<INewsletterSubscriber>;
export type NewsletterSubscriberDoc = HydratedDocument<INewsletterSubscriber>;

const NewsletterSubscriberSchema = new Schema<
  INewsletterSubscriber,
  NewsletterSubscriberModel
>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["subscribed", "unsubscribed", "bounced"],
      default: "subscribed",
      index: true,
    },
    source: { type: String, default: "footer" },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      sparse: true,
      index: true,
    },
    smsConsent: { type: Boolean, default: false, index: true },
    unsubscribeToken: { type: String, required: true, index: true },
    subscribedAt: { type: Date, default: Date.now },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const NewsletterSubscriber: NewsletterSubscriberModel =
  (mongoose.models.NewsletterSubscriber as
    | NewsletterSubscriberModel
    | undefined) ??
  (mongoose.model(
    "NewsletterSubscriber",
    NewsletterSubscriberSchema,
  ) as unknown as NewsletterSubscriberModel);

export default NewsletterSubscriber;
