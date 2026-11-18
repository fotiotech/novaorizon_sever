import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import Address from "../models/Address.js";
import { connection } from "../config/db.js";
import { quoteShippingPrice } from "./shipping-price.js";
import {
  previewCartDiscounts,
  type Cart as PromotionCart,
} from "./promotions.service.js";

/**
 * Server-side checkout.
 *
 * Ported from the storefront's `lib/checkout.ts`: the browser may only choose
 * products, quantities, addresses, a carrier and a payment method. Every
 * monetary value is recomputed here from the database.
 */

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
  variant?: string;
}

export interface CheckoutAddress {
  street?: string;
  city?: string;
  region?: string;
  address?: string;
  country?: string;
  carrier?: string;
}

export interface CreateCheckoutOrderInput {
  idempotencyKey?: string;
  items: CheckoutItemInput[];
  appliedCodes?: string[];
  carrierId?: string;
  shippingAddress: CheckoutAddress;
  billingAddress?: CheckoutAddress;
  billingAddressId?: string | null;
  paymentMethod: string;
  paymentMethodId?: string | null;
  guest?: { firstName?: string; lastName?: string; email?: string };
  notes?: string;
}

export interface CompleteAddress {
  street: string;
  city: string;
  region: string;
  address: string;
  country: string;
}

export interface CheckoutOrderSummary {
  orderNumber: string;
  orderId: string;
  paymentStatus: string;
  orderStatus: string;
  subtotal: number;
  discount: number;
  shippingCost: number;
  total: number;
  products: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  shippingAddress: CompleteAddress & { carrier?: string };
  billingAddress: CompleteAddress;
  createdAt?: string;
  paidAt?: string;
}

export interface CheckoutActor {
  userId?: string | null;
  guestId?: string | null;
  /** Convenience values for the order contact fields. */
  email?: string | null;
  name?: string | null;
}

const PAYMENT_METHODS = new Set(["MobileMoney", "PayPal", "CashOnDelivery"]);
const MAX_ITEMS = 50;
const MAX_QTY = 99;

function clean(value: unknown, max = 200): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function normalizeAddress(input: CheckoutAddress): CompleteAddress {
  const street = clean(input.street, 300);
  return {
    street,
    city: clean(input.city),
    region: clean(input.region),
    address: clean(input.address, 300) || street,
    country: clean(input.country),
  };
}

function isCompleteAddress(address: CompleteAddress): boolean {
  return Boolean(
    address.street && address.city && address.region && address.country,
  );
}

function makeOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = randomBytes(4).toString("hex").toUpperCase();
  return `ORD-${date}-${random}`;
}

export function toCheckoutSummary(order: any): CheckoutOrderSummary {
  return {
    orderNumber: String(order.orderNumber),
    orderId: String(order._id),
    paymentStatus: String(order.paymentStatus),
    orderStatus: String(order.orderStatus),
    subtotal: Number(order.subtotal) || 0,
    discount: Number(order.discount) || 0,
    shippingCost: Number(order.shippingCost) || 0,
    total: Number(order.total) || 0,
    products: (order.products ?? []).map((p: any) => ({
      productId: String(p.productId),
      name: String(p.name),
      quantity: Number(p.quantity) || 0,
      price: Number(p.price) || 0,
    })),
    shippingAddress: {
      street: String(order.shippingAddress?.street ?? ""),
      city: String(order.shippingAddress?.city ?? ""),
      region: String(order.shippingAddress?.region ?? ""),
      address: String(order.shippingAddress?.address ?? ""),
      country: String(order.shippingAddress?.country ?? ""),
      carrier: order.shippingAddress?.carrier
        ? String(order.shippingAddress.carrier)
        : undefined,
    },
    billingAddress: {
      street: String(order.billingAddress?.street ?? ""),
      city: String(order.billingAddress?.city ?? ""),
      region: String(order.billingAddress?.region ?? ""),
      address: String(order.billingAddress?.address ?? ""),
      country: String(order.billingAddress?.country ?? ""),
    },
    createdAt: order.createdAt
      ? new Date(order.createdAt).toISOString()
      : undefined,
    paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : undefined,
  };
}

export type CreateCheckoutOrderResult =
  | { success: true; order: CheckoutOrderSummary; reused: boolean }
  | { success: false; error: string };

export async function createCheckoutOrder(
  input: CreateCheckoutOrderInput,
  actor: CheckoutActor,
): Promise<CreateCheckoutOrderResult> {
  try {
    await connection();

    const userId = actor.userId ?? null;
    const guestId = userId ? null : (actor.guestId ?? null);

    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length === 0 || items.length > MAX_ITEMS) {
      return { success: false, error: "Your cart is empty or too large." };
    }

    const paymentMethod = clean(input.paymentMethod, 40);
    if (!PAYMENT_METHODS.has(paymentMethod)) {
      return { success: false, error: "Unsupported payment method." };
    }

    const shippingAddress = normalizeAddress(input.shippingAddress ?? {});
    if (!isCompleteAddress(shippingAddress)) {
      return {
        success: false,
        error: "A complete shipping address is required.",
      };
    }

    const billingAddress = input.billingAddress
      ? normalizeAddress(input.billingAddress)
      : shippingAddress;
    if (!isCompleteAddress(billingAddress)) {
      return {
        success: false,
        error: "A complete billing address is required.",
      };
    }

    if (!userId) {
      const email = clean(input.guest?.email, 200).toLowerCase();
      const firstName = clean(input.guest?.firstName, 80);
      const lastName = clean(input.guest?.lastName, 80);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, error: "A valid email address is required." };
      }
      if (!firstName || !lastName) {
        return { success: false, error: "First and last name are required." };
      }
      if (!guestId) {
        return { success: false, error: "Missing guest session." };
      }
    }

    const idempotencyKey =
      clean(input.idempotencyKey, 120) ||
      `srv-${randomBytes(16).toString("hex")}`;

    const ownerFilter: Record<string, any> = userId
      ? { userId: new mongoose.Types.ObjectId(userId) }
      : { guestId };

    const existing: any = await Order.findOne({
      idempotencyKey,
      ...ownerFilter,
    }).lean();
    if (existing) {
      return { success: true, order: toCheckoutSummary(existing), reused: true };
    }

    // Resolve products and prices from the database.
    const ids = Array.from(new Set(items.map((i) => clean(i.productId, 40))));
    if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return { success: false, error: "One of the cart items is invalid." };
    }

    const products = await Product.find({
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
      status: { $nin: ["draft", "inactive"] },
    })
      .select(
        "name price listPrice images quantity status categoryId brand variants",
      )
      .lean();

    const productMap = new Map(products.map((p: any) => [String(p._id), p]));

    const orderProducts: Array<{
      productId: mongoose.Types.ObjectId;
      name: string;
      quantity: number;
      price: number;
    }> = [];
    const promoItems: PromotionCart["items"] = [];

    for (const item of items) {
      const product: any = productMap.get(clean(item.productId, 40));
      if (!product) {
        return {
          success: false,
          error: "One of the cart items is no longer available.",
        };
      }

      const quantity = Math.floor(Number(item.quantity));
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QTY) {
        return { success: false, error: "Invalid item quantity." };
      }

      const available = Number(product.quantity) || 0;
      if (available < quantity) {
        return {
          success: false,
          error: `Only ${available} unit(s) of ${product.name || "this item"} are available.`,
        };
      }

      let unitPrice = Number(product.price) || Number(product.listPrice) || 0;
      if (item.variant && Array.isArray(product.variants)) {
        const variant = product.variants.find(
          (v: any) =>
            String(v?._id ?? "") === String(item.variant) ||
            String(v?.sku ?? "") === String(item.variant) ||
            String(v?.value ?? "") === String(item.variant),
        );
        const variantPrice = Number(variant?.price);
        if (Number.isFinite(variantPrice) && variantPrice > 0) {
          unitPrice = variantPrice;
        }
      }

      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return {
          success: false,
          error: "One of the cart items has no valid price.",
        };
      }

      orderProducts.push({
        productId: new mongoose.Types.ObjectId(String(product._id)),
        name: clean(product.name, 200) || "Product",
        quantity,
        price: unitPrice,
      });

      promoItems.push({
        productId: String(product._id),
        quantity,
        unitPrice,
        categoryIds: product.categoryId ? [String(product.categoryId)] : [],
        brandId: product.brand ? String(product.brand) : undefined,
      });
    }

    const subtotal = orderProducts.reduce(
      (sum, p) => sum + p.price * p.quantity,
      0,
    );

    let shippingCost = 0;
    if (input.carrierId) {
      try {
        shippingCost = await quoteShippingPrice(
          clean(input.carrierId, 40),
          shippingAddress.region,
        );
      } catch {
        return {
          success: false,
          error: "Shipping is not available for the selected address.",
        };
      }
    }

    const promoCart: PromotionCart = {
      items: promoItems,
      subtotal,
      shippingCost,
    };

    const discountResult = await previewCartDiscounts(
      promoCart,
      { customerId: userId ?? null },
      (input.appliedCodes ?? []).map((c) => clean(c, 40)).filter(Boolean),
    );

    const discount = Math.max(
      0,
      Math.min(
        Number(discountResult.totalDiscount) || 0,
        subtotal + shippingCost,
      ),
    );
    const total = Math.max(0, subtotal + shippingCost - discount);

    let billingAddressId: mongoose.Types.ObjectId | null = null;
    if (
      userId &&
      input.billingAddressId &&
      mongoose.Types.ObjectId.isValid(input.billingAddressId)
    ) {
      const owned = await Address.findOne({
        _id: input.billingAddressId,
        userId: new mongoose.Types.ObjectId(userId),
      })
        .select("_id")
        .lean();
      if (owned) {
        billingAddressId = new mongoose.Types.ObjectId(String(owned._id));
      }
    }

    const email = userId
      ? clean(actor.email, 200)
      : clean(input.guest?.email, 200).toLowerCase();

    const firstName =
      clean(input.guest?.firstName, 80) ||
      clean(actor.name ?? "", 80).split(/\s+/)[0] ||
      "Customer";
    const lastName =
      clean(input.guest?.lastName, 80) ||
      clean(actor.name ?? "", 80)
        .split(/\s+/)
        .slice(1)
        .join(" ") ||
      "Customer";

    let orderNumber = makeOrderNumber();
    for (let i = 0; i < 5; i++) {
      const exists = await Order.exists({ orderNumber });
      if (!exists) break;
      orderNumber = makeOrderNumber();
    }

    const created: any = await Order.create({
      orderNumber,
      idempotencyKey,
      userId: userId ? new mongoose.Types.ObjectId(userId) : null,
      guestId,
      email,
      firstName,
      lastName,
      products: orderProducts,
      subtotal,
      tax: 0,
      shippingCost,
      discount,
      total,
      paymentStatus: "pending",
      paymentMethod,
      paymentMethodId:
        input.paymentMethodId &&
        mongoose.Types.ObjectId.isValid(input.paymentMethodId)
          ? new mongoose.Types.ObjectId(input.paymentMethodId)
          : null,
      billingAddressId,
      billingAddress,
      shippingAddress: {
        ...shippingAddress,
        carrier: clean(input.shippingAddress?.carrier, 120) || undefined,
      },
      carrierId:
        input.carrierId && mongoose.Types.ObjectId.isValid(input.carrierId)
          ? new mongoose.Types.ObjectId(input.carrierId)
          : null,
      orderStatus: "pending",
      shippingStatus: "pending",
      notes: clean(input.notes, 1000) || undefined,
      inventoryStatus: "pending",
      appliedPromotions: (discountResult.applied ?? []).map((a: any) => ({
        promotionId: new mongoose.Types.ObjectId(String(a._id)),
        name: a.name,
        code: a.code,
        discount: Math.max(0, Number(a.discount) || 0),
        calculationType: a.calculationType,
      })),
    });

    return {
      success: true,
      order: toCheckoutSummary(created.toObject()),
      reused: false,
    };
  } catch (error: any) {
    console.error("[createCheckoutOrder] failed:", error?.message ?? error);
    return { success: false, error: "Unable to create the order." };
  }
}

export async function canAccessOrder(
  order: any,
  actor: CheckoutActor,
): Promise<boolean> {
  if (!order) return false;
  if (actor.userId && order.userId)
    return String(order.userId) === String(actor.userId);
  if (!actor.userId && order.guestId && actor.guestId)
    return String(order.guestId) === String(actor.guestId);
  return false;
}

export async function getCheckoutOrder(
  orderNumber: string,
  actor: CheckoutActor,
): Promise<CheckoutOrderSummary | null> {
  const number = clean(orderNumber, 80);
  if (!number) return null;

  await connection();
  const order: any = await Order.findOne({ orderNumber: number }).lean();
  if (!order || !(await canAccessOrder(order, actor))) return null;
  return toCheckoutSummary(order);
}