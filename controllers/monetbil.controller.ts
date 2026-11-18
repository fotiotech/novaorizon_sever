import type { Request, Response } from "express";
import axios from "axios";
import Order from "../models/Order.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import type { MonetbilPaymentRequest } from "../config/monetbil.types.js";
import { checkMonetbilPayment } from "../utils/monetbil.js";
import {
  markOrderFailed,
  markOrderPaid,
} from "../utils/order-service.js";

/**
 * Monetbil sends raw status values that don't match Order.paymentStatus enum.
 * The original passed `status` directly — silently persisting out-of-enum
 * values into `paymentStatus`. This maps to valid enum members.
 */

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

/* --------------------------- webhook handler ---------------------------- */

export async function handlePaymentNotification(
  req: Request,
  res: Response,
): Promise<void> {
  // Monetbil sends params in either the query string (GET) or the body (POST).
  const params: Record<string, any> = { ...req.query, ...(req.body ?? {}) };

  // Optional shared-secret guard (set MONETBIL_NOTIFY_TOKEN to enable).
  const notifyToken = process.env.MONETBIL_NOTIFY_TOKEN;
  if (notifyToken) {
    const supplied = String(params.token ?? params.key ?? "");
    if (supplied !== notifyToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const paymentId = String(
    params.paymentId ?? params.payment_id ?? params.transaction_id ?? "",
  );
  const orderNumber = String(
    params.payment_ref ?? params.item_ref ?? params.orderNumber ?? "",
  );

  if (!paymentId || !orderNumber) {
    res.status(400).json({ error: "Missing parameters" });
    return;
  }

  await connection();

  const order: any = await Order.findOne({ orderNumber }).lean();
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const transaction = await checkMonetbilPayment(paymentId);
  if (!transaction) {
    res.status(502).json({ error: "Payment could not be verified" });
    return;
  }

  if (transaction.status !== 1) {
    if (transaction.status === 0 || transaction.status === -1) {
      await markOrderFailed(orderNumber, "Monetbil payment failed or cancelled");
    }
    res.json({ ok: false, status: transaction.status });
    return;
  }

  if (transaction.payment_ref && transaction.payment_ref !== order.orderNumber) {
    res.status(400).json({ error: "Payment reference mismatch" });
    return;
  }

  const result = await markOrderPaid(orderNumber, {
    gateway: "monetbil",
    transactionId: paymentId,
    amount: transaction.amount,
    currency: transaction.currency,
  });

  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ ok: true, alreadyPaid: result.alreadyPaid });
}