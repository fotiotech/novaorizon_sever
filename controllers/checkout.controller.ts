import type { Request, Response } from "express";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { consumeRateLimit } from "../utils/rate-limit.js";
import { createMonetbilLink } from "../utils/monetbil.js";
import {
  previewCartDiscounts,
  recordPromotionUsage,
  validatePromotionCode,
  type Cart as PromotionCart,
  type CustomerContext,
} from "../utils/promotions.service.js";
import Order from "../models/Order.js";
import { PaymentMethod } from "../models/PaymentMethod.js";
import Invoice from "../models/Invoice.js";
import {
  createCheckoutOrder,
  getCheckoutOrder,
  type CheckoutActor,
} from "../utils/checkout.service.js";

/** Storefront checkout — customer or guest. */

function actorFrom(req: Request): CheckoutActor {
  const guestId =
    (req as any).cookies?.guestId ?? (req as any).cookies?.cart_sid ?? null;

  return {
    userId: req.user?.id ?? null,
    guestId: req.user?.id ? null : guestId,
    email: req.user?.email ?? null,
    name: req.user?.name ?? null,
  } as CheckoutActor;
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  const actor = actorFrom(req);

  const limit = consumeRateLimit(
    `checkout:${actor.userId ?? actor.guestId ?? "anonymous"}`,
    20,
    60 * 60 * 1000,
  );
  if (!limit.ok) {
    throw new AppError(
      "Too many checkout attempts. Please try again later.",
      429,
    );
  }

  const result = await createCheckoutOrder(req.body ?? {}, actor);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(result.reused ? 200 : 201).json({
    success: true,
    data: { order: result.order, reused: result.reused },
  });
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  const orderNumber = String(req.params.orderNumber ?? "");
  if (!orderNumber) {
    throw new ValidationError({ orderNumber: ["orderNumber is required"] });
  }

  await connection();
  const order = await getCheckoutOrder(orderNumber, actorFrom(req));
  if (!order) throw new AppError("Order not found", 404);

  res.json({ data: order });
}
/* --------------------------- start a payment ---------------------------- */

const OPERATORS = new Set(["CM_MTNMOBILEMONEY", "CM_ORANGEMONEY", "CM_EUMM"]);

export async function startOrderPayment(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = actorFrom(req);
  const orderNumber = String(req.params.orderNumber ?? "");
  const operator = String(req.body?.operator ?? "");

  if (!OPERATORS.has(operator)) {
    throw new ValidationError({ operator: ["Unsupported mobile money operator"] });
  }

  const limit = consumeRateLimit(
    `monetbil-start:${orderNumber}`,
    10,
    10 * 60 * 1000,
  );
  if (!limit.ok) {
    throw new AppError(
      "Too many payment attempts. Please try again later.",
      429,
    );
  }

  await connection();
  const order: any = await Order.findOne({ orderNumber }).lean();
  if (!order) throw new AppError("Order not found.", 404);

  const owns =
    (actor.userId && order.userId && String(order.userId) === String(actor.userId)) ||
    (!actor.userId && order.guestId && String(order.guestId) === String(actor.guestId));
  if (!owns) throw new AppError("Order not found.", 404);

  if (order.paymentStatus === "paid") {
    throw new AppError("This order is already paid.", 409);
  }
  if (
    order.paymentStatus === "refunded" ||
    order.paymentStatus === "cancelled"
  ) {
    throw new AppError("This order can no longer be paid.", 409);
  }

  const amount = Number(order.total);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("This order has no payable total.", 400);
  }

  let phone: string | undefined;
  if (order.paymentMethodId) {
    const method: any = await PaymentMethod.findOne({
      _id: order.paymentMethodId,
    })
      .select("details.phoneNumber")
      .lean();
    phone = method?.details?.phoneNumber;
  }

  const paymentUrl = await createMonetbilLink({
    amount,
    orderNumber: order.orderNumber,
    operator,
    phone,
    firstName: order.firstName || "Customer",
    lastName: order.lastName || "Customer",
    email: order.email,
  });

  res.json({ data: { paymentUrl, amount } });
}
/* ------------------------- promotions preview --------------------------- */

function readPromoBody(req: Request): {
  cart: PromotionCart;
  ctx: CustomerContext;
  codes: string[];
  selectedIds?: string[];
} {
  const body = req.body ?? {};
  const cart: PromotionCart = {
    items: Array.isArray(body.cart?.items) ? body.cart.items : [],
    subtotal: Number(body.cart?.subtotal) || 0,
    shippingCost: Number(body.cart?.shippingCost) || 0,
  };
  const ctx: CustomerContext = {
    customerId: req.user?.id ?? body.ctx?.customerId ?? null,
    customerGroupIds: Array.isArray(body.ctx?.customerGroupIds)
      ? body.ctx.customerGroupIds
      : [],
  };
  const codes = Array.isArray(body.codes)
    ? body.codes.map((c: unknown) => String(c))
    : [];
  const selectedIds = Array.isArray(body.selectedIds)
    ? body.selectedIds.map((c: unknown) => String(c))
    : undefined;

  return { cart, ctx, codes, selectedIds };
}

export async function previewPromotions(
  req: Request,
  res: Response,
): Promise<void> {
  const { cart, ctx, codes, selectedIds } = readPromoBody(req);
  const result = await previewCartDiscounts(cart, ctx, codes, selectedIds);
  res.json({ data: result });
}

export async function validatePromoCode(
  req: Request,
  res: Response,
): Promise<void> {
  const { cart, ctx } = readPromoBody(req);
  const code = String(req.body?.code ?? "");
  const result = await validatePromotionCode(code, cart, ctx);
  res.json({ data: result });
}
export async function recordPromoUsage(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body ?? {};
  const orderId = String(body.orderId ?? "");
  const applied = Array.isArray(body.applied) ? body.applied : [];

  if (!orderId) throw new ValidationError({ orderId: ["orderId is required"] });

  const result = await recordPromotionUsage(
    orderId,
    applied,
    req.user?.id ?? null,
  );
  res.json({ data: result });
}
/* ---------------------------- customer orders --------------------------- */

/** GET /api/checkout/orders — the caller's own orders (newest first). */
export async function listMyOrders(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = actorFrom(req);
  if (!actor.userId && !actor.guestId) {
    res.json({ data: { orders: [], total: 0 } });
    return;
  }

  await connection();

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: Record<string, any> = actor.userId
    ? { userId: actor.userId }
    : { guestId: actor.guestId };

  const escapeRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


  const orderNumber = String(req.query.orderNumber ?? "").trim();
  if (orderNumber) {
    filter.orderNumber = new RegExp(escapeRegex(orderNumber), "i");
  }
  if (req.query.orderStatus) filter.orderStatus = String(req.query.orderStatus);
  if (req.query.paymentStatus)
    filter.paymentStatus = String(req.query.paymentStatus);
  if (req.query.carrier)
    filter["shippingAddress.carrier"] = String(req.query.carrier);

  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = dateFrom;
    if (dateTo) filter.createdAt.$lte = dateTo;
  }

  const search = String(req.query.search ?? "").trim();
  if (search) {
    const re = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { orderNumber: re },
      { email: re },
      { firstName: re },
      { lastName: re },
    ];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("billingAddressId paymentMethodId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  res.json({
    data: {
      orders: JSON.parse(JSON.stringify(orders)),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

/** POST /api/checkout/orders/:orderNumber/return — customer requests a return. */
export async function requestOrderReturn(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = actorFrom(req);
  const orderNumber = String(req.params.orderNumber ?? "");
  const reason = String(req.body?.reason ?? "Customer requested a return")
    .trim()
    .slice(0, 1000);

  await connection();
  const order: any = await Order.findOne({ orderNumber });
  if (!order) throw new AppError("Order not found", 404);

  const owns =
    (actor.userId && order.userId && String(order.userId) === String(actor.userId)) ||
    (!actor.userId && order.guestId && String(order.guestId) === String(actor.guestId));
  if (!owns) throw new AppError("Order not found", 404);

  if (["returned", "cancelled", "return_requested"].includes(order.orderStatus)) {
    throw new AppError(
      "This order is already in a return or cancellation flow.",
      409,
    );
  }
  if (order.paymentStatus !== "paid") {
    throw new AppError("Only paid orders can be returned or refunded.", 400);
  }

  order.orderStatus = "return_requested";
  order.returnReason = reason;
  order.returnRequestedAt = new Date();
  await order.save();

  res.json({ success: true, data: JSON.parse(JSON.stringify(order)) });
}
/* ------------------------------- invoices ------------------------------- */

async function ownsOrder(
  orderNumber: string,
  actor: ReturnType<typeof actorFrom>,
): Promise<any | null> {
  await connection();
  const order: any = await Order.findOne({ orderNumber }).lean();
  if (!order) return null;

  const owns =
    (actor.userId && order.userId && String(order.userId) === String(actor.userId)) ||
    (!actor.userId && order.guestId && String(order.guestId) === String(actor.guestId));

  return owns ? order : null;
}

/** GET /api/checkout/orders/:orderNumber/invoice */
export async function getMyInvoice(
  req: Request,
  res: Response,
): Promise<void> {
  const orderNumber = String(req.params.orderNumber ?? "");
  const order = await ownsOrder(orderNumber, actorFrom(req));
  if (!order) throw new AppError("Invoice not found.", 404);

  const invoice: any = await Invoice.findOne({ orderNumber }).lean();
  if (!invoice) throw new AppError("Invoice not found.", 404);

  res.json({ data: JSON.parse(JSON.stringify(invoice)) });
}

/** GET /api/checkout/invoices/:invoiceNumber/download */
export async function downloadMyInvoice(
  req: Request,
  res: Response,
): Promise<void> {
  const invoiceNumber = String(req.params.invoiceNumber ?? "");

  await connection();
  const invoice: any = await Invoice.findOne({ invoiceNumber }).lean();
  if (!invoice) throw new AppError("Invoice not found.", 404);

  const order = await ownsOrder(String(invoice.orderNumber), actorFrom(req));
  if (!order) throw new AppError("Invoice not found.", 404);

  res.json({
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
