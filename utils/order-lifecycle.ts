/**
 * Order lifecycle.
 *
 *   pending → confirmed → processing → shipped → delivered
 *                                                ↓
 *                                      return_requested → returned
 *   (cancelled is allowed before shipping)
 *
 * Payment and shipping statuses remain separate fields; this module only owns
 * `orderStatus` and the transitions between its values.
 */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "return_requested",
  "returned",
  "cancelled",
] as const;

export type OrderLifecycleStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Record<
  OrderLifecycleStatus,
  readonly OrderLifecycleStatus[]
> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["return_requested"],
  return_requested: ["returned", "delivered"],
  returned: [],
  cancelled: [],
};

export const ORDER_STATUS_LABELS: Record<OrderLifecycleStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  return_requested: "Return requested",
  returned: "Returned",
  cancelled: "Cancelled",
};

/** Historic values that existed before the lifecycle was formalised. */
const LEGACY_STATUS_MAP: Record<string, OrderLifecycleStatus> = {
  "in transit": "shipped",
  intransit: "shipped",
  completed: "delivered",
  complete: "delivered",
  refunded: "returned",
};

export function normalizeOrderStatus(
  raw: unknown,
): OrderLifecycleStatus | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if ((ORDER_STATUSES as readonly string[]).includes(value)) {
    return value as OrderLifecycleStatus;
  }
  return LEGACY_STATUS_MAP[value] ?? null;
}

export function canTransition(
  from: OrderLifecycleStatus,
  to: OrderLifecycleStatus,
): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(
  from: OrderLifecycleStatus,
): readonly OrderLifecycleStatus[] {
  return ORDER_TRANSITIONS[from] ?? [];
}

/** Field set when a status is reached (used for the lifecycle timestamps). */
export const STATUS_TIMESTAMP_FIELD: Partial<
  Record<OrderLifecycleStatus, string>
> = {
  confirmed: "confirmedAt",
  processing: "processingAt",
  shipped: "shippedAt",
  delivered: "deliveredAt",
  cancelled: "cancelledAt",
  return_requested: "returnRequestedAt",
  returned: "returnedAt",
};
