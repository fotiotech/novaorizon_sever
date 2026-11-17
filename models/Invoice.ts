import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export type InvoiceStatus = "issued" | "paid" | "cancelled";

export interface IInvoiceProduct {
  productId: Types.ObjectId;
  name: string;
  quantity: number;
  price: number;
}

export interface IInvoiceAddress {
  street: string;
  city: string;
  region: string;
  address: string;
  country: string;
}

export interface IInvoice {
  invoiceNumber: string;
  orderNumber: string;
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  products: IInvoiceProduct[];
  subtotal: number;
  tax: number;
  shippingCost: number;
  discount: number;
  total: number;
  billingAddress: IInvoiceAddress;
  shippingAddress: IInvoiceAddress;
  paymentMethod: string;
  notes?: string | null;
  status: InvoiceStatus;
  issuedAt: Date;
  paidAt?: Date | null;
  dueAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type InvoiceModel = Model<IInvoice>;
export type InvoiceDoc = HydratedDocument<IInvoice>;

const InvoiceProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
  },
  { _id: false },
);

const InvoiceAddressSchema = new Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    region: { type: String, required: true },
    address: { type: String, required: true },
    country: { type: String, required: true },
  },
  { _id: false },
);

const InvoiceSchema = new Schema<IInvoice, InvoiceModel>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    orderNumber: { type: String, required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    products: { type: [InvoiceProductSchema], default: [] },
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    billingAddress: { type: InvoiceAddressSchema, required: true },
    shippingAddress: { type: InvoiceAddressSchema, required: true },
    paymentMethod: { type: String, required: true },
    notes: { type: String, default: null },
    status: {
      type: String,
      enum: ["issued", "paid", "cancelled"],
      default: "issued",
    },
    issuedAt: { type: Date, default: () => new Date() },
    paidAt: { type: Date, default: null },
    dueAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const Invoice: InvoiceModel =
  (mongoose.models.Invoice as InvoiceModel | undefined) ??
  (mongoose.model("Invoice", InvoiceSchema) as unknown as InvoiceModel);

export default Invoice;
