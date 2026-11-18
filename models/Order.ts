import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type PaymentStatus =
  | "pending"
  | "cod_pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";

export type InventoryStatus =
  | "pending"
  | "processing"
  | "deducted"
  | "shortage";

export type ShippingStatus = "pending" | "shipped" | "delivered";

export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "in transit"
  | "completed"
  | "return_requested"
  | "cancelled"
  | "returned";

export interface IOrderProduct {
  productId: Types.ObjectId;
  name: string;
  quantity: number;
  price: number;
}

export interface IOrderAddress {
  street: string;
  city: string;
  region: string;
  address: string;
  country: string;
  carrier?: string | null;
}

export interface IAppliedPromotion {
  promotionId: Types.ObjectId;
  name?: string | null;
  code?: string | null;
  discount: number;
  calculationType?: string | null;
}

export interface IOrder {
  orderNumber: string;
  transaction_id?: string | null;
  /** Null for guest checkouts — `guestId` identifies those. */
  userId?: Types.ObjectId | null;
  guestId?: string | null;
  idempotencyKey?: string | null;
  paymentGateway?: string | null;
  paymentReference?: string | null;
  appliedPromotions?: IAppliedPromotion[];
  email: string;
  firstName: string;
  lastName: string;
  products: IOrderProduct[];
  subtotal: number;
  tax: number;
  shippingCost: number;
  total: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  paidAt?: Date | null;
  inventoryDeducted: boolean;
  inventoryStatus: InventoryStatus;
  billingAddressId?: Types.ObjectId | null;
  paymentMethodId?: Types.ObjectId | null;
  billingAddress: IOrderAddress;
  shippingAddress: IOrderAddress;
  carrierId?: Types.ObjectId | null;
  shippingStatus: ShippingStatus;
  shippingDate?: Date | null;
  deliveryDate?: Date | null;
  orderStatus: OrderStatus;
  refundAmount: number;
  returnReason?: string | null;
  returnRequestedAt?: Date | null;
  refundedAt?: Date | null;
  notes?: string | null;
  couponCode?: string | null;
  discount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderModel = Model<IOrder>;
export type OrderDoc = HydratedDocument<IOrder>;

const OrderProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
  },
  { _id: false },
);

const OrderAddressSchema = new Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    region: { type: String, required: true },
    address: { type: String, required: true },
    country: { type: String, required: true },
    carrier: { type: String, default: null },
  },
  { _id: false },
);

const OrderSchema = new Schema<IOrder, OrderModel>(
  {
    orderNumber: { type: String, required: true, unique: true },
    transaction_id: { type: String, default: null },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
      index: true,
    },
    guestId: { type: String, default: null, index: true },
    idempotencyKey: { type: String, index: true, sparse: true },
    paymentGateway: { type: String, default: null },
    paymentReference: { type: String, default: null },
    appliedPromotions: [
      {
        _id: false,
        promotionId: {
          type: Schema.Types.ObjectId,
          ref: "Promotion",
          required: true,
        },
        name: { type: String, default: null },
        code: { type: String, default: null },
        discount: { type: Number, default: 0 },
        calculationType: { type: String, default: null },
      },
    ],
    email: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    products: { type: [OrderProductSchema], default: [] },
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "cod_pending",
        "paid",
        "failed",
        "cancelled",
        "refunded",
      ],
      default: "pending",
      index: true,
    },
    paymentMethod: { type: String, required: true },
    paidAt: { type: Date, default: null },
    inventoryDeducted: { type: Boolean, default: false },
    inventoryStatus: {
      type: String,
      enum: ["pending", "processing", "deducted", "shortage"],
      default: "pending",
    },
    billingAddressId: {
      type: Schema.Types.ObjectId,
      ref: "Address",
      default: null,
    },
    paymentMethodId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentMethod",
      default: null,
    },
    billingAddress: { type: OrderAddressSchema, required: true },
    shippingAddress: { type: OrderAddressSchema, required: true },
    carrierId: { type: Schema.Types.ObjectId, ref: "Carrier", default: null },
    shippingStatus: {
      type: String,
      enum: ["pending", "shipped", "delivered"],
      default: "pending",
      index: true,
    },
    shippingDate: { type: Date, default: null },
    deliveryDate: { type: Date, default: null },
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "shipped",
        "in transit",
        "completed",
        "return_requested",
        "returned",
        "cancelled",
      ],
      default: "processing",
      index: true,
    },
    refundAmount: { type: Number, default: 0 },
    returnReason: { type: String, default: null },
    returnRequestedAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    notes: { type: String, default: null },
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1, createdAt: -1 });
OrderSchema.index({ orderStatus: 1, createdAt: -1 });

const Order: OrderModel =
  (mongoose.models.Order as OrderModel | undefined) ??
  (mongoose.model("Order", OrderSchema) as unknown as OrderModel);

export default Order;