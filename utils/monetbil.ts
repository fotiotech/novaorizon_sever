import axios from "axios";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.middleware.js";

/**
 * Creates a Monetbil mobile-money payment link for an order.
 * Ported from the storefront's former `lib/monetbil.ts`.
 */
export async function createMonetbilLink(input: {
  amount: number;
  orderNumber: string;
  operator: string;
  phone?: string;
  firstName: string;
  lastName: string;
  email: string;
}): Promise<string> {
  const key = process.env.MONETBIL_SERVICE_KEY ?? "";
  if (!key) throw new AppError("Mobile money is not configured.", 500);

  const appUrl = env.frontendUrl.replace(/\/$/, "");

  const response = await axios.post(
    `https://api.monetbil.com/widget/v2.1/${encodeURIComponent(key)}`,
    {
      amount: Math.round(input.amount),
      phone: input.phone || undefined,
      locale: "en",
      operator: input.operator,
      country: "CM",
      currency: "XAF",
      item_ref: input.orderNumber,
      payment_ref: input.orderNumber,
      user: `${input.firstName} ${input.lastName}`.trim(),
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      return_url: `${appUrl}/checkout/payment/success?payment_ref=${encodeURIComponent(input.orderNumber)}`,
      notify_url: `${appUrl}/api/payments/monetbil`,
    },
    { timeout: 15_000 },
  );

  if (!response.data?.success || !response.data?.payment_url) {
    console.error("[monetbil] link generation failed:", response.data);
    throw new AppError("Monetbil rejected the payment request", 502);
  }

  return String(response.data.payment_url);
}
export interface MonetbilTransaction {
  status: number;
  amount?: number;
  currency?: string;
  payment_ref?: string;
  transaction_UUID?: string;
}

/**
 * Server-to-server verification. The callback body is never trusted on its
 * own; the gateway is asked for the transaction status before an order is
 * marked paid.
 */
export async function checkMonetbilPayment(
  paymentId: string,
): Promise<MonetbilTransaction | null> {
  try {
    const response = await axios.post(
      "https://api.monetbil.com/payment/v1/checkPayment",
      { paymentId },
      { timeout: 15_000 },
    );

    const transaction = response.data?.transaction;
    if (!transaction) return null;

    return {
      status: Number(transaction.status),
      amount: Number(transaction.amount),
      currency: transaction.currency,
      payment_ref: transaction.payment_ref,
      transaction_UUID: transaction.transaction_UUID,
    };
  } catch (error) {
    console.error("[monetbil] checkPayment failed:", error);
    return null;
  }
}
