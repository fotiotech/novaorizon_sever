import type { Request, Response } from "express";
import axios from "axios";
import Order from "../models/Order.js";
import Shipping from "../models/Shipping.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import type { MonetbilPaymentRequest } from "../config/monetbil.types.js";

/**
 * Monetbil sends raw status values that don't match Order.paymentStatus enum.
 * The original passed `status` directly — silently persisting out-of-enum
 * values into `paymentStatus`. This maps to valid enum members.
 */
const MONETBIL_STATUS_MAP: Record<
  string,
  "pending" | "paid" | "failed" | "cancelled"
> = {
  success: "paid",
  paid: "paid",
  failed: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
  pending: "pending",
  pending_payment: "pending",
};

/* ---------------------------- create link ------------------------------- */

export async function generatePaymentLink(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as MonetbilPaymentRequest;

  if (!body.serviceKey || !body.amount || !body.phone || !body.itemRef) {
    throw new ValidationError({
      _form: ["serviceKey, amount, phone, and itemRef are required"],
    });
  }

  try {
    const response = await axios.post(
      `https://api.monetbil.com/widget/v2.1/${body.serviceKey}`,
      {
        amount: body.amount,
        phone: body.phone,
        locale: body.locale || "en",
        operator: body.operator || "CM_MTNMOBILEMONEY",
        country: "CM",
        currency: "XAF",
        item_ref: body.itemRef,
        payment_ref: body.itemRef,
        user: body.user,
        first_name: body.firstName,
        last_name: body.lastName,
        email: body.email,
        return_url: body.returnUrl,
        notify_url: body.notifyUrl,
        logo: body.logo,
      },
      { timeout: 15_000 },
    );

    if (response.data?.success) {
      res.json({
        success: true,
        data: { paymentUrl: response.data.payment_url },
      });
      return;
    }

    console.error("[monetbil] link generation failed:", response.data);
    throw new AppError("Monetbil rejected the payment request", 502);
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    console.error("[monetbil] link request error:", err?.message);
    throw new AppError("Unable to reach Monetbil", 502);
  }
}

/* ---------------------------- update order ------------------------------ */

async function updateOrderStatusFromMonetbil(
  payment_ref: string,
  transaction_id: string,
  rawStatus: string,
): Promise<void> {
  const mapped = MONETBIL_STATUS_MAP[rawStatus];
  if (!mapped) {
    console.warn(
      `[monetbil] unknown status "${rawStatus}" for ref ${payment_ref}`,
    );
    return;
  }

  const savedOrder = await Order.findOneAndUpdate(
    { orderNumber: payment_ref },
    {
      $set: {
        transaction_id,
        paymentStatus: mapped,
        ...(mapped === "paid" ? { paidAt: new Date() } : {}),
      },
    },
    { new: true, runValidators: true },
  );
  if (!savedOrder) {
    console.warn(
      `[monetbil] order ${payment_ref} not found — status not applied`,
    );
    return;
  }

  // BUG FIXED: original created Shipping when paymentStatus === "cancelled",
  // which is backwards. Shipping is created for PAID orders.
  if (mapped === "paid") {
    const existing = await Shipping.findOne({ orderId: savedOrder._id }).lean();
    if (!existing) {
      await new Shipping({
        orderId: savedOrder._id,
        userId: savedOrder.userId,
        address: {
          street: savedOrder.shippingAddress.street,
          city: savedOrder.shippingAddress.city,
          region: savedOrder.shippingAddress.region,
          address: savedOrder.shippingAddress.address,
          country: savedOrder.shippingAddress.country,
        },
        carrier: savedOrder.shippingAddress.carrier || "Novaorizon",
        shippingMethod: "standard",
        trackingNumber: savedOrder.orderNumber,
        shippingCost: savedOrder.shippingCost || 0,
        status: "processing",
      }).save();
    }
  }
}

/* --------------------------- webhook handler ---------------------------- */

export async function handlePaymentNotification(
  req: Request,
  res: Response,
): Promise<void> {
  // Monetbil sends params in either the query string (GET) or the body (POST).
  // `req.query` + `req.body` covers both.
  const params: Record<string, any> = { ...req.query, ...(req.body ?? {}) };

  const transaction_id = String(params.transaction_id ?? "");
  const status = String(params.status ?? "");
  const payment_ref = String(params.payment_ref ?? params.item_ref ?? "");

  if (!transaction_id || !status || !payment_ref) {
    res.status(400).json({ error: "Invalid notification data" });
    return;
  }

  // NOTE: The original did not verify the request. Monetbil publishes an HMAC
  // signature in `sign`. If you want to enforce it:
  //   const expected = crypto.createHmac("sha512", env.monetbilSecret).update(...).digest("hex");
  //   if (params.sign !== expected) return res.status(401).json({ error: "Invalid signature" });
  // TODO: wire this before going to production.

  try {
    await connection();
    await updateOrderStatusFromMonetbil(payment_ref, transaction_id, status);
    res.json({ message: "Notification processed" });
  } catch (err) {
    console.error("[monetbil] notification handler error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
