import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type ExpenseStatus = "pending" | "approved" | "rejected";

export interface IExpense {
  category?: string | null;
  description?: string | null;
  amount?: number | null;
  date: Date;
  receipt?: string | null;
  status?: ExpenseStatus | null;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
}

export type ExpenseModel = Model<IExpense>;
export type ExpenseDoc = HydratedDocument<IExpense>;

const ExpenseSchema = new Schema<IExpense, ExpenseModel>({
  category: { type: String, default: null },
  description: { type: String, default: null },
  amount: { type: Number, default: null },
  date: { type: Date, default: Date.now },
  receipt: { type: String, default: null },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: null,
  },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  createdAt: { type: Date, default: Date.now },
});

const Expense: ExpenseModel =
  (mongoose.models.Expense as ExpenseModel | undefined) ??
  (mongoose.model("Expense", ExpenseSchema) as unknown as ExpenseModel);

export default Expense;
