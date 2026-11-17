import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

/**
 * NOTE (preserved from original):
 *   - `userId` has `unique: true` → only ONE session per user. Usually wrong;
 *     typically you'd want multiple sessions (per device).
 *   - `updated_ad` (typo) → should be `updated_at`. The field exists but
 *     nothing writes it; harmless but confusing.
 *   - `unique: [true]` is array form — mongoose treats it as truthy so it works,
 *     but it's non-standard.
 * If you send the surrounding auth logic I can rewrite this correctly.
 */
export interface ISession {
  userId: Types.ObjectId;
  expiresAt: Date;
  created_at: Date;
  updated_ad?: Date | null;
}

export type SessionModel = Model<ISession>;
export type SessionDoc = HydratedDocument<ISession>;

const SessionSchema = new Schema<ISession, SessionModel>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true,
  },
  expiresAt: { type: Date, required: true, index: true },
  created_at: { type: Date, default: Date.now },
  updated_ad: { type: Date, default: null },
});

const Session: SessionModel =
  (mongoose.models.Session as SessionModel | undefined) ??
  (mongoose.model("Session", SessionSchema) as unknown as SessionModel);

export default Session;
