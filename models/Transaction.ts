import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type TransactionType = "income" | "expense" | "refund";
export type TransactionStatus = "completed" | "pending" | "failed" | "refunded";

export interface ITransaction {
  orderId?: Types.ObjectId | null;
  userId?: Types.ObjectId | null;
  amount: number;
  type: TransactionType;
  description: string;
  paymentMethod: string;
  status: TransactionStatus;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionModel = Model<ITransaction>;
export type TransactionDoc = HydratedDocument<ITransaction>;

const TransactionSchema = new Schema<ITransaction, TransactionModel>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    type: {
      type: String,
      enum: ["income", "expense", "refund"],
      required: true,
      index: true,
    },
    description: { type: String, default: "" },
    paymentMethod: { type: String, default: "" },
    status: {
      type: String,
      enum: ["completed", "pending", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    date: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

TransactionSchema.index({ date: -1 });
TransactionSchema.index({ type: 1, status: 1, date: -1 });

const Transaction: TransactionModel =
  (mongoose.models.Transaction as TransactionModel | undefined) ??
  (mongoose.model(
    "Transaction",
    TransactionSchema,
  ) as unknown as TransactionModel);

export default Transaction;
