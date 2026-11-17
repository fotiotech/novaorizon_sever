import type { Request, Response } from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import type { CartSessionRequest } from "../middleware/cart-session.middleware.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function getIdentifier(req: Request): { userId?: string; sessionId?: string } {
  const userId = req.user?.id;
  const sessionId = (req as CartSessionRequest).cartSessionId;
  if (!userId && !sessionId) {
    throw new ValidationError({ _form: ["No user or session identity"] });
  }
  return { userId, sessionId };
}

/* ---------------------------- cart helpers ------------------------------ */

async function recalculateCart(cart: any) {
  const itemTotals = cart.items.map((item: any) => ({
    ...item,
    totalPrice: item.price * item.quantity - (item.discount || 0),
  }));
  const subtotal = itemTotals.reduce(
    (sum: number, item: any) => sum + item.totalPrice,
    0,
  );
  const tax = 0;
  const discount = cart.discount || 0;
  const shippingCost = cart.shippingCost || 0;
  cart.subtotal = subtotal;
  cart.tax = tax;
  cart.total = subtotal + tax + shippingCost - discount;
  return cart;
}

async function populateAndLean(cart: any) {
  await cart.populate("items.productId", "name images slug price");
  return cart.toObject();
}

function serializeCart(cart: any) {
  if (!cart) return null;
  return {
    ...cart,
    _id: cart._id?.toString?.() ?? cart._id,
    userId: cart.userId?.toString?.() ?? cart.userId ?? null,
    items: (cart.items ?? []).map((item: any) => ({
      ...item,
      _id: item._id?.toString?.() ?? item._id,
      name: item.productId?.name || item.name || "",
      image: item.productId?.images?.[0] || item.image || null,
      price: item.productId?.price || item.price || 0,
      productId:
        item.productId?._id?.toString?.() || item.productId?.toString?.(),
    })),
  };
}

/* ------------------------------- GET cart ------------------------------- */

export async function getCart(req: Request, res: Response): Promise<void> {
  await connection();
  const { userId, sessionId } = getIdentifier(req);

  const query: any = userId ? { userId } : { sessionId };

  let cart: any = await Cart.findOne(query)
    .populate("items.productId", "name images slug price")
    .lean();

  if (!cart) {
    const created = await Cart.create({
      userId: userId || undefined,
      sessionId: userId ? undefined : sessionId,
      items: [],
      subtotal: 0,
      tax: 0,
      discount: 0,
      shippingCost: 0,
      total: 0,
    });
    cart = created.toObject();
  }

  res.json({ data: serializeCart(cart) });
}

/* ------------------------------ ADD item -------------------------------- */

export async function addToCart(req: Request, res: Response): Promise<void> {
  await connection();
  const { userId, sessionId } = getIdentifier(req);

  const { productId, variant, quantity } = req.body ?? {};
  if (
    !productId ||
    typeof productId !== "string" ||
    !mongoose.Types.ObjectId.isValid(productId)
  ) {
    throw new ValidationError({ productId: ["Invalid product ID"] });
  }
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ValidationError({ quantity: ["Quantity must be > 0"] });
  }

  const product: any = await Product.findById(productId)
    .select("price name images quantity lowStockThreshold")
    .lean();
  if (!product) throw new AppError("Product not found", 404);

  const availableQty = Number(product.quantity ?? 0);

  let cart: any = await Cart.findOne(userId ? { userId } : { sessionId });
  if (!cart) {
    cart = new Cart({
      userId: userId || undefined,
      sessionId: userId ? undefined : sessionId,
      items: [],
    });
  }

  const currentQtyInCart = cart.items.reduce((sum: number, item: any) => {
    if (item.productId.toString() !== productId) return sum;
    if ((item.variant || null) !== (variant || null)) return sum;
    return sum + Number(item.quantity || 0);
  }, 0);

  if (availableQty < currentQtyInCart + qty) {
    const remaining = Math.max(0, availableQty - currentQtyInCart);
    throw new AppError(
      remaining > 0
        ? `Only ${remaining} unit${remaining > 1 ? "s" : ""} available in stock.`
        : "Insufficient stock available.",
      409,
    );
  }

  const existingIdx = cart.items.findIndex(
    (item: any) =>
      item.productId.toString() === productId &&
      (item.variant || null) === (variant || null),
  );

  if (existingIdx > -1) {
    cart.items[existingIdx].quantity += qty;
  } else {
    cart.items.push({
      productId: new mongoose.Types.ObjectId(productId),
      variant: variant || undefined,
      image: product.images?.[0] || null,
      name: product.name,
      quantity: qty,
      price: product.price,
      taxRate: 0,
      discount: 0,
    });
  }

  await recalculateCart(cart);
  await cart.save();
  const cartObject = await populateAndLean(cart);

  res.json({ success: true, data: serializeCart(cartObject) });
}

/* ---------------------------- UPDATE item ------------------------------- */

export async function updateCartItem(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const { userId, sessionId } = getIdentifier(req);
  const itemId = param(req, "itemId");
  const quantity = Number(req.body?.quantity);

  if (!Number.isFinite(quantity)) {
    throw new ValidationError({ quantity: ["Quantity must be a number"] });
  }

  const cart = await Cart.findOne(userId ? { userId } : { sessionId });
  if (!cart) throw new AppError("Cart not found", 404);

  const idx = cart.items.findIndex(
    (i: any) => String(i._id) === String(itemId),
  );
  if (idx === -1) throw new AppError("Item not found in cart", 404);

  if (quantity <= 0) {
    cart.items.splice(idx, 1);
  } else {
    const item = cart.items[idx];
    const product: any = await Product.findById(item.productId)
      .select("quantity")
      .lean();
    const availableQty = Number(product?.quantity ?? 0);
    if (quantity > availableQty) {
      throw new AppError(
        `Only ${availableQty} unit${availableQty > 1 ? "s" : ""} available in stock.`,
        409,
      );
    }
    item.quantity = quantity;
  }

  await recalculateCart(cart);
  await cart.save();
  const cartObject = await populateAndLean(cart);

  res.json({ success: true, data: serializeCart(cartObject) });
}

/* ---------------------------- REMOVE item ------------------------------- */

export async function removeFromCart(
  req: Request,
  res: Response,
): Promise<void> {
  req.body = { ...(req.body ?? {}), quantity: 0 };
  return updateCartItem(req, res);
}

/* ----------------------------- CLEAR cart ------------------------------- */

export async function clearCart(req: Request, res: Response): Promise<void> {
  await connection();
  const { userId, sessionId } = getIdentifier(req);

  const cart = await Cart.findOne(userId ? { userId } : { sessionId });
  if (!cart) throw new AppError("Cart not found", 404);

  cart.items = [];
  await recalculateCart(cart);
  await cart.save();
  const cartObject = await populateAndLean(cart);

  res.json({ success: true, data: serializeCart(cartObject) });
}

/* --------------------------- APPLY discount ----------------------------- */

export async function applyDiscount(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const { userId, sessionId } = getIdentifier(req);

  const discountValue = Number(req.body?.discountValue);
  const couponCode = req.body?.couponCode as string | undefined;
  if (!Number.isFinite(discountValue)) {
    throw new ValidationError({ discountValue: ["Must be a number"] });
  }

  const cart = await Cart.findOne(userId ? { userId } : { sessionId });
  if (!cart) throw new AppError("Cart not found", 404);

  await recalculateCart(cart);
  cart.discount = Math.max(0, Math.min(discountValue, cart.subtotal));
  if (couponCode) cart.appliedCoupon = couponCode;

  await recalculateCart(cart);
  await cart.save();
  const cartObject = await populateAndLean(cart);

  res.json({ success: true, data: serializeCart(cartObject) });
}

/* ----------------------- MERGE guest into user cart --------------------- */

export async function mergeGuestSessionData(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const userId = req.user!.id;
  const guestSessionId = (req as CartSessionRequest).cartSessionId;

  if (!guestSessionId) {
    res.json({ success: true, merged: false });
    return;
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  let targetCart = await Cart.findOne({ userId: userObjectId });
  const guestCarts = await Cart.find({ sessionId: guestSessionId });

  if (!targetCart && guestCarts.length > 0) {
    targetCart = guestCarts[0];
    targetCart.userId = userObjectId;
    targetCart.sessionId = null as any;
  }

  if (!targetCart) {
    targetCart = new Cart({
      userId: userObjectId,
      items: [],
      subtotal: 0,
      tax: 0,
      discount: 0,
      shippingCost: 0,
      total: 0,
    });
  }

  for (const guestCart of guestCarts) {
    if (guestCart._id.toString() === targetCart._id?.toString()) continue;

    for (const item of guestCart.items) {
      const existing = targetCart.items.find(
        (cartItem: any) =>
          cartItem.productId.toString() === item.productId.toString() &&
          (cartItem.variant || null) === (item.variant || null),
      );

      if (existing) {
        existing.quantity += item.quantity;
        existing.price = item.price;
      } else {
        targetCart.items.push({
          productId: item.productId,
          variant: item.variant,
          quantity: item.quantity,
          name: item.name,
          image: item.image,
          price: item.price,
          taxRate: item.taxRate || 0,
          discount: item.discount || 0,
        });
      }
    }
    await Cart.deleteOne({ _id: guestCart._id });
  }

  targetCart.userId = userObjectId;
  targetCart.sessionId = null as any;
  await recalculateCart(targetCart);
  await targetCart.save();

  // Attach any pending guest orders to this user (best-effort).
  await Order.updateMany(
    { userId: null, "shippingAddress.street": { $exists: true } },
    { $set: { userId: userObjectId } },
  );

  res.json({ success: true, merged: true });
}
