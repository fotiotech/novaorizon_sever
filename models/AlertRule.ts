import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export type AlertMetric =
  | "purchase_count"
  | "cart_abandon_rate"
  | "revenue"
  | "zero_traffic";

export interface IAlertRule {
  name: string;
  metric: AlertMetric;
  window: number;
  threshold: number;
  comparator: "gt" | "lt";
  enabled: boolean;
  cooldown: number;
  lastFiredAt?: Date | null;
}

export type AlertRuleModel = Model<IAlertRule>;
export type AlertRuleDoc = HydratedDocument<IAlertRule>;

const AlertRuleSchema = new Schema<IAlertRule, AlertRuleModel>(
  {
    name: { type: String, required: true },
    metric: {
      type: String,
      enum: ["purchase_count", "cart_abandon_rate", "revenue", "zero_traffic"],
      required: true,
    },
    window: { type: Number, required: true },
    threshold: { type: Number, required: true },
    comparator: { type: String, enum: ["gt", "lt"], required: true },
    enabled: { type: Boolean, default: true },
    cooldown: { type: Number, default: 300 },
    lastFiredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const AlertRule: AlertRuleModel =
  (mongoose.models.AlertRule as AlertRuleModel | undefined) ??
  (mongoose.model("AlertRule", AlertRuleSchema) as unknown as AlertRuleModel);

export { AlertRule };
export default AlertRule;
