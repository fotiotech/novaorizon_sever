import { connection } from "../config/db.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { getPusher } from "./pusher.js";

export type NotificationKind =
  | "order"
  | "payment"
  | "promotion"
  | "product"
  | "system";

const RECIPIENT_ROLES = ["admin"] as const;

/**
 * Send the same message to every active admin.
 * Creates one Notification doc per admin and broadcasts a single Pusher
 * event on the `admin-notifications` channel.
 *
 * Returns `{ success: true, count }` when at least one admin was reached.
 */
export async function notifyAdmins(
  kind: NotificationKind,
  message: string,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await connection();

    const admins = await User.find({
      role: { $in: RECIPIENT_ROLES },
      status: "active",
      deletedAt: null,
    })
      .select("_id")
      .lean();

    if (admins.length === 0) {
      console.warn(`[notify:${kind}] No active admins found — skipping.`);
      return { success: false, error: "No admins found" };
    }

    const now = new Date();
    const docs = admins.map((a: any) => ({
      userId: a._id,
      message,
      type: kind,
      isRead: false,
      timestamp: now,
    }));

    const inserted = await Notification.insertMany(docs);

    const pusher = getPusher();
    if (pusher) {
      await pusher.trigger("admin-notifications", "new-notification", {
        id: String(inserted[0]._id),
        message,
        type: kind,
        timestamp: now.toISOString(),
      });
    }

    return { success: true, count: admins.length };
  } catch (error: any) {
    console.error(`[notify:${kind}] Failed:`, error);
    return { success: false, error: error?.message ?? "Unknown error" };
  }
}

/* ------------------------- convenience wrappers ------------------------- */

export interface NewOrderParams {
  orderNumber: string;
  customerName?: string;
  total?: number;
  currency?: string;
}

export async function notifyAdminsAboutNewOrder(params: NewOrderParams) {
  const { orderNumber, customerName, total, currency = "CFA" } = params;
  const pieces = [`New order #${orderNumber}`];
  if (customerName) pieces.push(`from ${customerName}`);
  if (typeof total === "number")
    pieces.push(`— ${currency} ${total.toFixed(2)}`);
  return notifyAdmins("order", pieces.join(" "));
}

export interface PaymentSuccessParams {
  orderNumber: string;
  customerName?: string;
  total?: number;
  currency?: string;
  transactionId?: string;
}

export async function notifyAdminsAboutPaymentSuccess(
  params: PaymentSuccessParams,
) {
  const {
    orderNumber,
    customerName,
    total,
    currency = "CFA",
    transactionId,
  } = params;
  const pieces = [`Payment received for order #${orderNumber}`];
  if (typeof total === "number")
    pieces.push(`— ${currency} ${total.toFixed(2)}`);
  if (customerName) pieces.push(`from ${customerName}`);
  if (transactionId) pieces.push(`(txn ${transactionId})`);
  return notifyAdmins("payment", pieces.join(" "));
}
