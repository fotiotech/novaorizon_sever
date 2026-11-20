import type { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Shipping from "../models/Shipping.js";
import Transaction from "../models/Transaction.js";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import {
  deductOrderItem,
  releaseOrderReservations,
} from "../utils/inventory.js";
import Invoice from "../models/Invoice.js";
import "../models/Address.js";
import "../models/PaymentMethod.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function getProductQuantity(product: any): number {
  return Number(product?.quantity ?? 0);
}

/* ------------------------------- helpers -------------------------------- */

async function deductInventoryForOrder(order: any): Promise<void> {
  const claim = await Order.updateOne(
    { _id: order._id, inventoryStatus: "pending" },
    { $set: { inventoryStatus: "processing" } },
  );
  if (claim.modifiedCount === 0) return;

  let shortage = false;
  for (const item of order.products ?? []) {
    const outcome = await deductOrderItem(item);
    if (outcome === "shortage") shortage = true;
  }

  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        inventoryDeducted: !shortage,
        inventoryStatus: shortage ? "shortage" : "deducted",
      },
    },
  );
}

async function createInvoiceForOrder(order: any): Promise<void> {
  try {
    const existing = await Invoice.findOne({
      orderNumber: order.orderNumber,
    }).lean();
    if (existing) return;

    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const invoiceNumber = `INV-${year}-${random}`;

    await Invoice.create({
      invoiceNumber,
      orderNumber: order.orderNumber,
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
  } catch (err) {
    console.error("[createInvoiceForOrder]", err);
  }
}

/* ------------------------------ findOrders ------------------------------ */

export async function findOrders(req: Request, res: Response): Promise<void> {
  await connection();

  const {
    orderNumber,
    userId,
    page = "1",
    limit = "10",
    orderStatus,
    paymentStatus,
    search,
    dateFrom,
    dateTo,
    carrier,
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const query: Record<string, any> = {};

  if (orderNumber) query.orderNumber = new RegExp(orderNumber, "i");
  if (userId) query.userId = userId;
  if (orderStatus) query.orderStatus = orderStatus;
  if (paymentStatus) query.paymentStatus = paymentStatus;

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(dateTo);
  }
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [
      { orderNumber: re },
      { email: re },
      { firstName: re },
      { lastName: re },
    ];
  }
  if (carrier) query["shippingAddress.carrier"] = carrier;

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("billingAddressId paymentMethodId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Order.countDocuments(query),
  ]);

  res.json({
    data: {
      orders: orders.map((o: any) => ({
        ...o,
        _id: o._id.toString(),
        userId: o.userId?.toString(),
      })),
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
    },
  });
}

/* --------------------------- updateOrderStatus -------------------------- */

export async function updateOrderStatus(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const orderNumber = param(req, "orderNumber");
  const { paymentStatus, orderStatus } = req.body ?? {};

  if (!orderNumber) throw new ValidationError({ orderNumber: ["required"] });
  if (!paymentStatus && !orderStatus) {
    throw new ValidationError({
      _form: ["At least one status must be provided"],
    });
  }

  const existing: any = await Order.findOne({ orderNumber })
    .select("paymentStatus")
    .lean();
  const wasPaid = existing?.paymentStatus === "paid";

  const updateFields: Record<string, any> = {};
  if (paymentStatus) updateFields.paymentStatus = paymentStatus;
  if (orderStatus) updateFields.orderStatus = orderStatus;
  if (paymentStatus === "paid" && !wasPaid) {
    updateFields.paidAt = new Date();
    updateFields.inventoryStatus = "pending";
  }

  const order = await Order.findOneAndUpdate(
    { orderNumber },
    { $set: updateFields },
    { new: true, runValidators: false },
  );
  if (!order) throw new AppError(`Order ${orderNumber} not found`, 404);

  if (paymentStatus === "paid" && !wasPaid) {
    await deductInventoryForOrder(order).catch((err) =>
      console.error("[updateOrderStatus] inventory deduction failed:", err),
    );
  }
  if (orderStatus === "cancelled") {
    await releaseOrderReservations(order).catch((err) =>
      console.error("[updateOrderStatus] release reservations failed:", err),
    );
  }
  if (paymentStatus === "paid") {
    await createInvoiceForOrder(order);
  }
  if (paymentStatus === "refunded") {
    try {
      await new Transaction({
        orderId: order._id,
        userId: order.userId,
        amount: order.total,
        type: "refund",
        description: `Refund for order #${order.orderNumber}`,
        status: "completed",
        paymentMethod: order.paymentMethod,
        date: new Date(),
      }).save();
    } catch (err) {
      console.error("[updateOrderStatus] refund transaction failed:", err);
    }
  }

  res.json({ success: true, data: order.toObject() });
}

/* ---------------------------- completePOSOrder -------------------------- */

export async function completePOSOrder(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const { userId, sessionId } = req.body?.identifier ?? {};
  const customer = req.body?.customer ?? {};

  const fallbackAddress = {
    street: customer.street || "Walk-in customer",
    city: customer.city || "N/A",
    region: customer.region || "N/A",
    address: customer.address || "Walk-in customer",
    country: customer.country || "CMR",
  };

  if (!userId && !sessionId) {
    throw new ValidationError({ _form: ["No active POS session found."] });
  }

  const cart: any = await Cart.findOne(
    userId ? { userId } : { sessionId },
  ).lean();
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    throw new AppError("Cart is empty.", 400);
  }

  const orderProducts: any[] = [];
  for (const item of cart.items) {
    const product: any = await Product.findById(item.productId).lean();
    if (!product)
      throw new AppError(
        "One of the products in the cart no longer exists.",
        400,
      );

    const availableQty = getProductQuantity(product);
    if (Number(item.quantity || 0) > availableQty) {
      // FIXED: original used product.title (undefined on Product schema).
      throw new AppError(
        `Insufficient quantity for ${product.name || "selected product"}. Only ${availableQty} available.`,
        409,
      );
    }

    orderProducts.push({
      productId: item.productId,
      name: product.name || "Product",
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
    });
  }

  const order = await Order.create({
    orderNumber: `POS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    userId: userId
      ? new mongoose.Types.ObjectId(userId)
      : new mongoose.Types.ObjectId(),
    email: customer.email || "pos@local",
    firstName: customer.firstName || "POS",
    lastName: customer.lastName || "Customer",
    products: orderProducts,
    subtotal: Number(cart.subtotal || 0),
    tax: Number(cart.tax || 0),
    shippingCost: Number(cart.shippingCost || 0),
    total: Number(cart.total || 0),
    paymentStatus: "paid",
    paymentMethod: customer.paymentMethod || "cash",
    billingAddress: fallbackAddress,
    shippingAddress: { ...fallbackAddress, carrier: "POS" },
    shippingStatus: "pending",
    orderStatus: "completed",
    discount: Number(cart.discount || 0),
    notes: customer.notes || `POS sale via ${sessionId || userId || "guest"}`,
  });

  for (const item of cart.items) {
    const product: any = await Product.findById(item.productId);
    if (!product) continue;
    product.quantity = Math.max(
      0,
      getProductQuantity(product) - Number(item.quantity || 0),
    );
    await product.save();
  }

  await Cart.deleteOne({ _id: cart._id });
  res.status(201).json({ success: true, data: order.toObject() });
}

/* ---------------------------- requestReturn ----------------------------- */

export async function requestReturn(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const orderNumber = param(req, "orderNumber");
  const reason = String(
    req.body?.reason ?? "Customer requested a return",
  ).trim();

  if (!orderNumber) throw new ValidationError({ orderNumber: ["required"] });

  const order = await Order.findOne({ orderNumber });
  if (!order) throw new AppError("Order not found", 404);

  if (
    ["returned", "cancelled", "return_requested"].includes(order.orderStatus)
  ) {
    throw new AppError(
      "This order is already in a return or cancellation flow.",
      409,
    );
  }
  if (order.paymentStatus !== "paid") {
    throw new AppError("Only paid orders can be returned or refunded.", 400);
  }

  const updated = await Order.findOneAndUpdate(
    { orderNumber },
    {
      $set: {
        orderStatus: "return_requested",
        returnReason: reason,
        returnRequestedAt: new Date(),
      },
    },
    { new: true },
  );

  res.json({ success: true, data: updated?.toObject() });
}

/* -------------------------- resolveReturnRequest ------------------------ */

export async function resolveReturnRequest(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const orderNumber = param(req, "orderNumber");
  const action = req.body?.action as "approve" | "reject";
  const options = req.body?.options ?? {};

  if (!orderNumber) throw new ValidationError({ orderNumber: ["required"] });
  if (action !== "approve" && action !== "reject") {
    throw new ValidationError({ action: ["Must be approve or reject"] });
  }

  const order = await Order.findOne({ orderNumber });
  if (!order) throw new AppError("Order not found", 404);

  if (action === "approve" && order.paymentStatus === "refunded") {
    throw new AppError("This order has already been refunded.", 409);
  }

  if (action === "approve") {
    const refundAmount = Number(options?.refundAmount ?? order.total ?? 0);
    const updated = await Order.findOneAndUpdate(
      { orderNumber },
      {
        $set: {
          orderStatus: "returned",
          paymentStatus: "refunded",
          refundAmount,
          refundedAt: new Date(),
          returnReason:
            options?.reason || order.returnReason || "Approved by admin",
        },
      },
      { new: true },
    );

    await new Transaction({
      orderId: order._id,
      userId: order.userId,
      amount: refundAmount,
      type: "refund",
      description: `Refund approved for order #${order.orderNumber}`,
      status: "completed",
      paymentMethod: order.paymentMethod,
      date: new Date(),
    }).save();

    for (const item of order.products || []) {
      const product = await Product.findById(item.productId);
      if (!product) continue;
      product.quantity = Math.max(
        0,
        getProductQuantity(product) + Number(item.quantity || 0),
      );
      await product.save();
    }

    res.json({ success: true, data: updated?.toObject() });
    return;
  }

  const updated = await Order.findOneAndUpdate(
    { orderNumber },
    {
      $set: {
        orderStatus: "completed",
        returnReason:
          options?.reason || order.returnReason || "Return rejected by admin",
      },
    },
    { new: true },
  );

  res.json({ success: true, data: updated?.toObject() });
}

/* ----------------------- createOrUpdateOrder ---------------------------- */

export async function createOrUpdateOrder(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const payment_ref = param(req, "paymentRef");
  const data = req.body ?? {};

  if (!payment_ref || !data) {
    throw new ValidationError({ _form: ["Missing payment_ref or data"] });
  }

  const {
    tax = 0,
    shippingCost = 0,
    paymentStatus = "pending",
    shippingStatus = "pending",
    orderStatus = "processing",
    discount = 0,
    shippingAddress,
    billingAddress,
    billingAddressId,
    paymentMethodId,
    ...rest
  } = data;

  const payload: Record<string, any> = {
    ...rest,
    orderNumber: payment_ref,
    tax,
    shippingCost,
    paymentStatus,
    shippingStatus,
    orderStatus,
    discount,
    shippingAddress: {
      street: shippingAddress?.street || "",
      region: shippingAddress?.region || "",
      city: shippingAddress?.city || "",
      address: shippingAddress?.address || "",
      carrier: shippingAddress?.carrier || "Novaorizon",
      country: shippingAddress?.country || "",
    },
    billingAddress: {
      street: billingAddress?.street || "",
      city: billingAddress?.city || "",
      region: billingAddress?.region || "",
      address: billingAddress?.address || "",
      country: billingAddress?.country || "",
    },
    billingAddressId: billingAddressId || null,
    paymentMethodId: paymentMethodId || null,
  };

  const savedOrder = await Order.findOneAndUpdate(
    { orderNumber: payment_ref },
    payload,
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  res.json({ success: true, data: savedOrder });
}

/* ------------------------------- deleteOrder ---------------------------- */

export async function deleteOrder(req: Request, res: Response): Promise<void> {
  await connection();
  const orderNumber = param(req, "orderNumber");
  if (!orderNumber) throw new ValidationError({ orderNumber: ["required"] });

  const deleted = await Order.findOneAndDelete({ orderNumber });
  if (!deleted) throw new AppError("Order not found", 404);
  res.json({ success: true });
}

/* -------------------------- generateTrackingNumber ---------------------- */

export async function generateTrackingNumber(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  let tracking = String(req.body?.trackingNumber ?? "");
  if (!tracking) throw new ValidationError({ trackingNumber: ["required"] });

  const existing = await Shipping.findOne({ trackingNumber: tracking });
  if (existing) {
    res.json({ data: { trackingNumber: tracking } });
    return;
  }

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 10; i++) {
    tracking += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  res.json({ data: { trackingNumber: tracking } });
}