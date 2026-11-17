import type { Request, Response } from "express";
import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";
import "../models/Address.js";
import "../models/PaymentMethod.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${year}-${random}`;
}

export async function createInvoice(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const orderNumber = param(req, "orderNumber");
  if (!orderNumber) throw new ValidationError({ orderNumber: ["required"] });

  const order: any = await Order.findOne({ orderNumber }).lean();
  if (!order) throw new AppError("Order not found", 404);
  if (order.paymentStatus !== "paid") {
    throw new AppError("Only paid orders can have invoices issued.", 400);
  }

  const existing = await Invoice.findOne({ orderNumber }).lean();
  if (existing) {
    res.json({ success: true, data: existing });
    return;
  }

  const invoice = await Invoice.create({
    invoiceNumber: generateInvoiceNumber(),
    orderNumber,
    orderId: order._id,
    userId: order.userId,
    email: order.email,
    firstName: order.firstName,
    lastName: order.lastName,
    products: order.products,
    subtotal: order.subtotal,
    tax: order.tax,
    shippingCost: order.shippingCost,
    discount: order.discount,
    total: order.total,
    billingAddress: order.billingAddress,
    shippingAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod,
    notes: order.notes,
    status: "paid",
    issuedAt: new Date(),
    paidAt: new Date(),
  });

  res.status(201).json({ success: true, data: invoice.toObject() });
}

export async function getInvoiceByOrderNumber(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const orderNumber = param(req, "orderNumber");
  const invoice = await Invoice.findOne({ orderNumber }).lean();
  if (!invoice) throw new AppError("Invoice not found", 404);
  res.json({ success: true, data: invoice });
}

export async function getInvoicesByUserId(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const userId = param(req, "userId");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const [invoices, total] = await Promise.all([
    Invoice.find({ userId })
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments({ userId }),
  ]);

  res.json({ success: true, data: { invoices, total } });
}

export async function findInvoices(req: Request, res: Response): Promise<void> {
  await connection();
  const {
    page = "1",
    limit = "10",
    orderNumber,
    status,
    dateFrom,
    dateTo,
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const query: Record<string, any> = {};
  if (orderNumber) query.orderNumber = new RegExp(orderNumber, "i");
  if (status) query.status = status;
  if (dateFrom || dateTo) {
    query.issuedAt = {};
    if (dateFrom) query.issuedAt.$gte = new Date(dateFrom);
    if (dateTo) query.issuedAt.$lte = new Date(dateTo);
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Invoice.countDocuments(query),
  ]);

  res.json({ success: true, data: { invoices, total } });
}

export async function updateInvoiceStatus(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const invoiceNumber = param(req, "invoiceNumber");
  const status = req.body?.status as "issued" | "paid" | "cancelled";

  if (!["issued", "paid", "cancelled"].includes(status)) {
    throw new ValidationError({ status: ["Invalid status"] });
  }

  const invoice = await Invoice.findOneAndUpdate(
    { invoiceNumber },
    { status },
    { new: true },
  );
  if (!invoice) throw new AppError("Invoice not found", 404);
  res.json({ success: true, data: invoice.toObject() });
}

export async function downloadInvoice(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const invoiceNumber = param(req, "invoiceNumber");
  const invoice: any = await Invoice.findOne({ invoiceNumber }).lean();
  if (!invoice) throw new AppError("Invoice not found", 404);

  res.json({
    success: true,
    data: {
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: invoice.orderNumber,
      issuedAt: new Date(invoice.issuedAt).toLocaleDateString(),
      customer: `${invoice.firstName} ${invoice.lastName}`,
      email: invoice.email,
      billingAddress: invoice.billingAddress,
      shippingAddress: invoice.shippingAddress,
      products: invoice.products,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      shippingCost: invoice.shippingCost,
      discount: invoice.discount,
      total: invoice.total,
      paymentMethod: invoice.paymentMethod,
    },
  });
}
