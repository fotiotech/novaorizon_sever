import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export interface ICartItem {
  productId: Types.ObjectId;
  variant?: string;
  quantity: number;
  name: string;
  image: string;
  price: number;
  taxRate?: number;
  discount?: number;
}

export interface ICart {
  userId?: Types.ObjectId | null;
  sessionId?: string | null;
  items: ICartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  shippingCost: number;
  total: number;
  currency: string;
  appliedCoupon?: string | null;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CartModel = Model<ICart>;
export type CartDoc = HydratedDocument<ICart>;

const CartItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1 },
    name: { type: String, required: true },
    image: { type: String, required: true },
    price: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
  },
  { _id: true },
);

const CartSchema = new Schema<ICart, CartModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    sessionId: { type: String, default: null, index: true },
    items: { type: [CartItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },
    appliedCoupon: { type: String, default: null },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true },
);

CartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

CartSchema.pre("validate", function (this: ICart) {
  if (!this.userId && !this.sessionId) {
    throw new Error("Either userId or sessionId is required");
  }
});

const Cart: CartModel =
  (mongoose.models.Cart as CartModel | undefined) ??
  (mongoose.model("Cart", CartSchema) as unknown as CartModel);

export default Cart;
