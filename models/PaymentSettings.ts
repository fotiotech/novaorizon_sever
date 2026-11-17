import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface MobileMoneyProviderConfig {
  enabled: boolean;
  merchantName: string;
  merchantCode: string;
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
  ussdCode: string;
  environment: "sandbox" | "production";
  instructions: string;
}

export interface IPaymentSettings {
  key: string;
  cashOnDelivery: {
    enabled: boolean;
    minimumOrder: number;
    fee: number;
    instructions: string;
  };
  cardPayment: {
    enabled: boolean;
    provider: "stripe" | "paystack" | "flutterwave" | "none";
    publicKey: string;
    secretKey: string;
    environment: "sandbox" | "production";
  };
  bankTransfer: {
    enabled: boolean;
    bankName: string;
    accountName: string;
    accountNumber: string;
    swift: string;
    instructions: string;
  };
  mobileMoney: {
    enabled: boolean;
    mtm: MobileMoneyProviderConfig;
    orange: MobileMoneyProviderConfig;
    wave: MobileMoneyProviderConfig;
    moov: MobileMoneyProviderConfig;
  };
  currency: string;
  currencySymbol: string;
  defaultMethod: "cash_on_delivery" | "card" | "bank_transfer" | "mobile_money";
  testMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentSettingsModel = Model<IPaymentSettings>;
export type PaymentSettingsDoc = HydratedDocument<IPaymentSettings>;

const ProviderSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    merchantName: { type: String, default: "", trim: true },
    merchantCode: { type: String, default: "", trim: true },
    clientId: { type: String, default: "", trim: true },
    clientSecret: { type: String, default: "", trim: true, select: false },
    subscriptionKey: { type: String, default: "", trim: true, select: false },
    ussdCode: { type: String, default: "", trim: true },
    environment: {
      type: String,
      enum: ["sandbox", "production"],
      default: "sandbox",
    },
    instructions: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const emptyProvider = (): MobileMoneyProviderConfig => ({
  enabled: false,
  merchantName: "",
  merchantCode: "",
  clientId: "",
  clientSecret: "",
  subscriptionKey: "",
  ussdCode: "",
  environment: "sandbox",
  instructions: "",
});

const PaymentSettingsSchema = new Schema<
  IPaymentSettings,
  PaymentSettingsModel
>(
  {
    key: { type: String, required: true, unique: true, default: "payment" },

    cashOnDelivery: {
      enabled: { type: Boolean, default: true },
      minimumOrder: { type: Number, default: 0, min: 0 },
      fee: { type: Number, default: 0, min: 0 },
      instructions: { type: String, default: "" },
    },

    cardPayment: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ["stripe", "paystack", "flutterwave", "none"],
        default: "none",
      },
      publicKey: { type: String, default: "" },
      secretKey: { type: String, default: "", select: false },
      environment: {
        type: String,
        enum: ["sandbox", "production"],
        default: "sandbox",
      },
    },

    bankTransfer: {
      enabled: { type: Boolean, default: false },
      bankName: { type: String, default: "" },
      accountName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      swift: { type: String, default: "" },
      instructions: { type: String, default: "" },
    },

    mobileMoney: {
      enabled: { type: Boolean, default: false },
      mtm: { type: ProviderSchema, default: emptyProvider },
      orange: { type: ProviderSchema, default: emptyProvider },
      wave: { type: ProviderSchema, default: emptyProvider },
      moov: { type: ProviderSchema, default: emptyProvider },
    },

    currency: { type: String, default: "XAF" },
    currencySymbol: { type: String, default: "CFA" },
    defaultMethod: {
      type: String,
      enum: ["cash_on_delivery", "card", "bank_transfer", "mobile_money"],
      default: "cash_on_delivery",
    },
    testMode: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, any>) {
        delete ret.__v;
        // Never leak secrets in JSON responses.
        if (ret.cardPayment) delete ret.cardPayment.secretKey;
        for (const provider of ["mtm", "orange", "wave", "moov"]) {
          if (ret.mobileMoney?.[provider]) {
            delete ret.mobileMoney[provider].clientSecret;
            delete ret.mobileMoney[provider].subscriptionKey;
          }
        }
        return ret;
      },
    },
  },
);

const PaymentSettings: PaymentSettingsModel =
  (mongoose.models.PaymentSettings as PaymentSettingsModel | undefined) ??
  (mongoose.model(
    "PaymentSettings",
    PaymentSettingsSchema,
  ) as unknown as PaymentSettingsModel);

export default PaymentSettings;
