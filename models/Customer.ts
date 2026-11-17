import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export interface ICustomerBillingAddress {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postalCode?: string | null;
  preferences?: string[];
}

export interface ICustomerShippingAddress {
  street?: string | null;
  region?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  carrier?: string | null;
  shippingMethod?: string | null;
}

export interface ICustomerBillingMethod {
  methodType?: string | null;
  details?: {
    token?: string;
    last4?: string;
    expiryDate?: string;
    cardholderName?: string;
  } | null;
}

export interface ICustomer {
  userId: Types.ObjectId;
  photo?: string | null;
  language?: string | null;
  billingAddress: ICustomerBillingAddress;
  shippingAddress: ICustomerShippingAddress;
  billingMethod?: ICustomerBillingMethod | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomerModel = Model<ICustomer>;
export type CustomerDoc = HydratedDocument<ICustomer>;

const CustomerSchema = new Schema<ICustomer, CustomerModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    photo: { type: String, default: null },
    language: { type: String, default: null },
    billingAddress: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      // NOTE (preserved from original): `unique: true` here means two
      // customers cannot share a billing email. Almost certainly a bug —
      // remove `unique: true` unless you actually want that constraint.
      email: { type: String, required: true, unique: true },
      phone: { type: String, default: null },
      address: { type: String, default: null },
      city: { type: String, default: null },
      region: { type: String, default: null },
      country: { type: String, default: null },
      postalCode: { type: String, default: null },
      preferences: { type: [String], default: [] },
    },
    shippingAddress: {
      region: { type: String, default: null },
      street: { type: String, default: null },
      city: { type: String, default: null },
      state: { type: String, default: null },
      postalCode: { type: String, default: null },
      country: { type: String, default: null },
      carrier: { type: String, default: null },
      shippingMethod: { type: String, default: null },
    },
    billingMethod: {
      methodType: { type: String, default: null },
      details: {
        token: { type: String, select: false },
        last4: { type: String, default: null },
        expiryDate: { type: String, default: null },
        cardholderName: { type: String, default: null },
      },
    },
  },
  { timestamps: true },
);

const Customer: CustomerModel =
  (mongoose.models.Customer as CustomerModel | undefined) ??
  (mongoose.model("Customer", CustomerSchema) as unknown as CustomerModel);

export default Customer;
