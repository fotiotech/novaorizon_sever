import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type ShippingMethod = "standard" | "express" | "overnight";

export type ShippingStatus =
  | "processing"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "returned"
  | "cancelled";

export interface IShippingAddress {
  street: string;
  city: string;
  /**
   * NOTE (preserved from original): the interface says `state` but the schema
   * defines `region`. This means `state` is never populated and reads back as
   * undefined. If you want this field, rename here to `region` OR update the
   * schema field name.
   */
  region?: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface IShipping {
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  address: IShippingAddress;
  trackingNumber?: string | null;
  carrier: string;
  shippingMethod: ShippingMethod;
  shippingCost: number;
  status: ShippingStatus;
  returnReason?: string | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ShippingModel = Model<IShipping>;
export type ShippingDoc = HydratedDocument<IShipping>;

const ShippingSchema = new Schema<IShipping, ShippingModel>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      region: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    trackingNumber: { type: String, default: null },
    carrier: { type: String, required: true },
    shippingMethod: {
      type: String,
      enum: ["standard", "express", "overnight"],
      required: true,
    },
    shippingCost: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: [
        "processing",
        "assigned",
        "in_transit",
        "delivered",
        "returned",
        "cancelled",
      ],
      default: "processing",
      index: true,
    },
    returnReason: { type: String, default: null },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ShippingSchema.index({ status: 1, createdAt: -1 });

const Shipping: ShippingModel =
  (mongoose.models.Shipping as ShippingModel | undefined) ??
  (mongoose.model("Shipping", ShippingSchema) as unknown as ShippingModel);

export default Shipping;
