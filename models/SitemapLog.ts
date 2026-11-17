import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export type SitemapLogAction =
  | "generated"
  | "submitted"
  | "error"
  | "updated_settings";

export interface ISitemapLog {
  action: SitemapLogAction;
  details?: string | null;
  urlsCount?: number | null;
  duration?: number | null;
  error?: string | null;
  triggeredBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SitemapLogModel = Model<ISitemapLog>;
export type SitemapLogDoc = HydratedDocument<ISitemapLog>;

const SitemapLogSchema = new Schema<ISitemapLog, SitemapLogModel>(
  {
    action: {
      type: String,
      enum: ["generated", "submitted", "error", "updated_settings"],
      required: true,
      index: true,
    },
    details: { type: String, default: null },
    urlsCount: { type: Number, default: null },
    duration: { type: Number, default: null },
    error: { type: String, default: null },
    triggeredBy: { type: String, default: null },
  },
  { timestamps: true },
);

const SitemapLog: SitemapLogModel =
  (mongoose.models.SitemapLog as SitemapLogModel | undefined) ??
  (mongoose.model(
    "SitemapLog",
    SitemapLogSchema,
  ) as unknown as SitemapLogModel);

export default SitemapLog;
