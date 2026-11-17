import mongoose, { Schema, Types, Model } from "mongoose";

export interface IPaymentMethodBase {
  userId: Types.ObjectId;
  methodType: "CreditCard" | "MobileMoney" | "PayPal";
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreditCardPaymentMethod extends IPaymentMethodBase {
  methodType: "CreditCard";
  details: {
    token?: string;
    last4: string;
    cardType: string;
    expiryMonth: string;
    expiryYear: string;
    expiryDate: string;
    cardholderName: string;
    billingAddressId: Types.ObjectId;
  };
}

export interface IMobileMoneyPaymentMethod extends IPaymentMethodBase {
  methodType: "MobileMoney";
  details: {
    phoneNumber: string;
    provider: "MTN" | "Orange" | "Camtel";
    reference?: string;
  };
}

export interface IPayPalPaymentMethod extends IPaymentMethodBase {
  methodType: "PayPal";
  details: { email: string };
}

export type IPaymentMethod =
  | ICreditCardPaymentMethod
  | IMobileMoneyPaymentMethod
  | IPayPalPaymentMethod;

export type PaymentMethodBaseModel = Model<IPaymentMethodBase>;
export type CreditCardPaymentMethodModel = Model<ICreditCardPaymentMethod>;
export type MobileMoneyPaymentMethodModel = Model<IMobileMoneyPaymentMethod>;
export type PayPalPaymentMethodModel = Model<IPayPalPaymentMethod>;

/* ---------------------------- schemas ----------------------------------- */

const BasePaymentMethodSchema = new Schema<
  IPaymentMethodBase,
  PaymentMethodBaseModel
>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    methodType: {
      type: String,
      required: true,
      enum: ["CreditCard", "MobileMoney", "PayPal"],
    },
  },
  { timestamps: true, discriminatorKey: "methodType" },
);

const CreditCardSchema = new Schema({
  details: {
    token: { type: String, select: false },
    last4: { type: String, required: true },
    cardType: { type: String, required: true },
    expiryMonth: { type: String, required: true },
    expiryYear: { type: String, required: true },
    expiryDate: { type: String, required: true },
    cardholderName: { type: String, required: true },
    billingAddressId: {
      type: Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },
  },
});

const MobileMoneySchema = new Schema({
  details: {
    phoneNumber: { type: String, required: true },
    provider: {
      type: String,
      required: true,
      enum: ["MTN", "Orange", "Camtel"],
    },
    reference: { type: String, default: null },
  },
});

const PayPalSchema = new Schema({
  details: { email: { type: String, required: true } },
});

/* ---------------------------- model + discriminators -------------------- */

const PaymentMethod: PaymentMethodBaseModel =
  (mongoose.models.PaymentMethod as PaymentMethodBaseModel | undefined) ??
  (mongoose.model(
    "PaymentMethod",
    BasePaymentMethodSchema,
  ) as unknown as PaymentMethodBaseModel);

const CreditCardPaymentMethod: CreditCardPaymentMethodModel =
  (PaymentMethod.discriminators?.CreditCard as
    | CreditCardPaymentMethodModel
    | undefined) ??
  (PaymentMethod.discriminator(
    "CreditCard",
    CreditCardSchema,
  ) as unknown as CreditCardPaymentMethodModel);

const MobileMoneyPaymentMethod: MobileMoneyPaymentMethodModel =
  (PaymentMethod.discriminators?.MobileMoney as
    | MobileMoneyPaymentMethodModel
    | undefined) ??
  (PaymentMethod.discriminator(
    "MobileMoney",
    MobileMoneySchema,
  ) as unknown as MobileMoneyPaymentMethodModel);

const PayPalPaymentMethod: PayPalPaymentMethodModel =
  (PaymentMethod.discriminators?.PayPal as
    | PayPalPaymentMethodModel
    | undefined) ??
  (PaymentMethod.discriminator(
    "PayPal",
    PayPalSchema,
  ) as unknown as PayPalPaymentMethodModel);

export {
  PaymentMethod,
  CreditCardPaymentMethod,
  MobileMoneyPaymentMethod,
  PayPalPaymentMethod,
};
