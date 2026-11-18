import type { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Transaction from "../models/Transaction.js";
import Expense from "../models/Expense.js";
import "../models/User.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

/**
 * Admin finance dashboard (revenue, transactions, charts, export).
 * Ported from the admin app's former `actions/finance.ts`.
 */

function startDateFor(timeRange: string): Date {
  const start = new Date();
  if (timeRange === "week") start.setDate(start.getDate() - 7);
  else if (timeRange === "quarter") start.setMonth(start.getMonth() - 3);
  else if (timeRange === "year") start.setFullYear(start.getFullYear() - 1);
  else start.setMonth(start.getMonth() - 1);
  return start;
}

function transactionQuery(
  startDate: Date,
  filters: { status?: string; search?: string },
): Record<string, any> {
  const query: Record<string, any> = { date: { $gte: startDate } };
  if (filters.status && filters.status !== "all") query.status = filters.status;
  if (filters.search) {
    query.$or = [
      { orderId: { $regex: filters.search, $options: "i" } },
      { "userId.name": { $regex: filters.search, $options: "i" } },
    ];
  }
  return query;
}

/* ------------------------------ stats ------------------------------------ */

export async function getFinancialStats(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const timeRange = String(req.query.timeRange ?? "month");
  const startDate = startDateFor(timeRange);

  const [totalRevenue, totalOrders, avgOrderValue, refunds] = await Promise.all([
    Transaction.aggregate([
      { $match: { status: "completed", type: "income", date: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Order.countDocuments({
      paymentStatus: "paid",
      createdAt: { $gte: startDate },
    }),
    Order.aggregate([
      { $match: { paymentStatus: "paid", createdAt: { $gte: startDate } } },
      { $group: { _id: null, avg: { $avg: "$total" } } },
    ]),
    Transaction.aggregate([
      { $match: { type: "refund", date: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  res.json({
    data: {
      totalRevenue: totalRevenue[0]?.total || 0,
      totalOrders,
      avgOrderValue: avgOrderValue[0]?.avg || 0,
      refunds: refunds[0]?.total || 0,
    },
  });
}

/* --------------------------- transactions -------------------------------- */

export async function getTransactions(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const timeRange = String(req.query.timeRange ?? "month");
  const startDate = startDateFor(timeRange);

  const query = transactionQuery(startDate, {
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
  });

  const transactions = await Transaction.find(query)
    .populate("userId", "name email")
    .sort({ date: -1 })
    .limit(50)
    .lean();

  res.json({ data: JSON.parse(JSON.stringify(transactions)) });
}

export async function updateTransactionStatus(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const id = String(req.params.id ?? "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid transaction id"] });
  }

  const status = String(req.body?.status ?? "");
  if (!status) throw new ValidationError({ status: ["status is required"] });

  const transaction = await Transaction.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  );
  if (!transaction) throw new AppError("Transaction not found", 404);

  if (status === "refunded") {
    await Order.findOneAndUpdate(
      { orderNumber: String(transaction.orderId) } as any,
      { paymentStatus: "refunded" },
    );
  }

  res.json({ data: transaction.toObject() });
}

/* -------------------------------- charts --------------------------------- */

export async function getChartData(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const timeRange = String(req.query.timeRange ?? "month");
  const startDate = startDateFor(timeRange);

  const [revenueByPeriod, expensesByCategory] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          status: "completed",
          type: "income",
          date: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            week: { $week: "$date" },
          },
          revenue: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 } },
    ]),
    Expense.aggregate([
      { $match: { date: { $gte: startDate }, status: "approved" } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
    ]),
  ]);

  const revenue = revenueByPeriod.map((item: any) => {
    let name: string;
    if (timeRange === "week") name = `Week ${item._id.week}`;
    else if (timeRange === "month")
      name = new Date(item._id.year, item._id.month - 1).toLocaleString(
        "default",
        { month: "short" },
      );
    else if (timeRange === "quarter")
      name = `Q${Math.ceil(item._id.month / 3)} ${item._id.year}`;
    else name = String(item._id.year);

    return { name, revenue: item.revenue, count: item.count };
  });

  const expenses = expensesByCategory.map((item: any) => ({
    name: item._id,
    value: item.total,
  }));

  res.json({ data: { revenue, expenses } });
}

/* -------------------------------- export --------------------------------- */

export async function exportFinancialData(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const format = String(req.query.format ?? "csv");
  const timeRange = String(req.query.timeRange ?? "month");
  const startDate = startDateFor(timeRange);

  const query = transactionQuery(startDate, {
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
  });

  const transactions = await Transaction.find(query).sort({ date: -1 }).lean();
  const expenses = await Expense.find({
    date: { $gte: startDate },
    status: "approved",
  })
    .sort({ date: -1 })
    .lean();

  if (format === "json") {
    res.json({
      data: {
        transactions: transactions.map((t: any) => ({
          type: "transaction",
          date: t.date,
          orderId: t.orderId,
          amount: t.amount,
          status: t.status,
          paymentMethod: t.paymentMethod,
        })),
        expenses: expenses.map((e: any) => ({
          type: "expense",
          date: e.date,
          category: e.category,
          description: e.description,
          amount: e.amount,
          status: e.status,
        })),
      },
    });
    return;
  }

  let csv = "Type,Date,Description,Amount,Status\n";
  transactions.forEach((t: any) => {
    csv += `Transaction,${new Date(t.date).toISOString().split("T")[0]},"Order #${t.orderId}",${t.amount},${t.status}\n`;
  });
  expenses.forEach((e: any) => {
    csv += `Expense,${new Date(e.date).toISOString().split("T")[0]},"${e.description}",${e.amount},${e.status}\n`;
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="financial-data.csv"',
  );
  res.send(csv);
}
