import type { Request, Response } from "express";
import PaymentSettings from "../models/PaymentSettings.js";
import { connection } from "../config/db.js";
import { ValidationError } from "../middleware/error.middleware.js";

const KEY = "payment";

const emptyProvider = () => ({
  enabled: false,
  merchantName: "",
  merchantCode: "",
  clientId: "",
  clientSecret: "",
  subscriptionKey: "",
  ussdCode: "",
  environment: "sandbox" as const,
  instructions: "",
});

const DEFAULTS = {
  cashOnDelivery: {
    enabled: true,
    minimumOrder: 0,
    fee: 0,
    instructions: "Pay with cash on delivery.",
  },
  cardPayment: {
    enabled: false,
    provider: "none" as const,
    publicKey: "",
    secretKey: "",
    environment: "sandbox" as const,
  },
  bankTransfer: {
    enabled: false,
    bankName: "",
    accountName: "",
    accountNumber: "",
    swift: "",
    instructions: "",
  },
  mobileMoney: {
    enabled: false,
    mtm: emptyProvider(),
    orange: emptyProvider(),
    wave: emptyProvider(),
    moov: emptyProvider(),
  },
  currency: "XAF",
  currencySymbol: "CFA",
  defaultMethod: "cash_on_delivery" as const,
  testMode: true,
};

function serializeProvider(p: any) {
  const base = emptyProvider();
  if (!p) return base;
  return {
    enabled: !!p.enabled,
    merchantName: p.merchantName ?? "",
    merchantCode: p.merchantCode ?? "",
    clientId: p.clientId ?? "",
    // Never return the secret from JSON responses.
    clientSecret: "",
    subscriptionKey: "",
    ussdCode: p.ussdCode ?? "",
    environment: p.environment === "production" ? "production" : "sandbox",
    instructions: p.instructions ?? "",
  };
}

function serialize(doc: any) {
  if (!doc) return DEFAULTS;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    cashOnDelivery: {
      enabled: !!o.cashOnDelivery?.enabled,
      minimumOrder: Number(o.cashOnDelivery?.minimumOrder ?? 0),
      fee: Number(o.cashOnDelivery?.fee ?? 0),
      instructions: o.cashOnDelivery?.instructions ?? "",
    },
    cardPayment: {
      enabled: !!o.cardPayment?.enabled,
      provider: o.cardPayment?.provider ?? "none",
      publicKey: o.cardPayment?.publicKey ?? "",
      secretKey: "", // never return
      environment:
        o.cardPayment?.environment === "production" ? "production" : "sandbox",
    },
    bankTransfer: {
      enabled: !!o.bankTransfer?.enabled,
      bankName: o.bankTransfer?.bankName ?? "",
      accountName: o.bankTransfer?.accountName ?? "",
      accountNumber: o.bankTransfer?.accountNumber ?? "",
      swift: o.bankTransfer?.swift ?? "",
      instructions: o.bankTransfer?.instructions ?? "",
    },
    mobileMoney: {
      enabled: !!o.mobileMoney?.enabled,
      mtm: serializeProvider(o.mobileMoney?.mtm),
      orange: serializeProvider(o.mobileMoney?.orange),
      wave: serializeProvider(o.mobileMoney?.wave),
      moov: serializeProvider(o.mobileMoney?.moov),
    },
    currency: o.currency ?? "XAF",
    currencySymbol: o.currencySymbol ?? "CFA",
    defaultMethod: o.defaultMethod ?? "cash_on_delivery",
    testMode: !!o.testMode,
  };
}

function providerPatch(input: any) {
  return {
    enabled: !!input?.enabled,
    merchantName: String(input?.merchantName ?? "").trim(),
    merchantCode: String(input?.merchantCode ?? "").trim(),
    clientId: String(input?.clientId ?? "").trim(),
    clientSecret: String(input?.clientSecret ?? "").trim(),
    subscriptionKey: String(input?.subscriptionKey ?? "").trim(),
    ussdCode: String(input?.ussdCode ?? "").trim(),
    environment: input?.environment === "production" ? "production" : "sandbox",
    instructions: String(input?.instructions ?? "").trim(),
  };
}

export async function getPaymentSettings(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const doc = await PaymentSettings.findOne({ key: KEY }).lean();
  res.json({ data: serialize(doc) });
}

export async function updatePaymentSettings(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const input = req.body ?? {};
  const patch: Record<string, any> = {};

  if (input.cashOnDelivery) {
    const c = input.cashOnDelivery;
    const min = Number(c.minimumOrder ?? 0);
    const fee = Number(c.fee ?? 0);
    if (!Number.isFinite(min) || min < 0) {
      throw new ValidationError({
        "cashOnDelivery.minimumOrder": ["Must be non-negative"],
      });
    }
    if (!Number.isFinite(fee) || fee < 0) {
      throw new ValidationError({
        "cashOnDelivery.fee": ["Must be non-negative"],
      });
    }
    patch.cashOnDelivery = {
      enabled: !!c.enabled,
      minimumOrder: min,
      fee,
      instructions: String(c.instructions ?? "").trim(),
    };
  }
  if (input.cardPayment) {
    const c = input.cardPayment;
    patch.cardPayment = {
      enabled: !!c.enabled,
      provider: ["stripe", "paystack", "flutterwave", "none"].includes(
        c.provider,
      )
        ? c.provider
        : "none",
      publicKey: String(c.publicKey ?? "").trim(),
      secretKey: String(c.secretKey ?? "").trim(),
      environment: c.environment === "production" ? "production" : "sandbox",
    };
  }
  if (input.bankTransfer) {
    const b = input.bankTransfer;
    patch.bankTransfer = {
      enabled: !!b.enabled,
      bankName: String(b.bankName ?? "").trim(),
      accountName: String(b.accountName ?? "").trim(),
      accountNumber: String(b.accountNumber ?? "").trim(),
      swift: String(b.swift ?? "").trim(),
      instructions: String(b.instructions ?? "").trim(),
    };
  }
  if (input.mobileMoney) {
    const m = input.mobileMoney;
    patch.mobileMoney = {
      enabled: !!m.enabled,
      mtm: providerPatch(m.mtm),
      orange: providerPatch(m.orange),
      wave: providerPatch(m.wave),
      moov: providerPatch(m.moov),
    };
  }
  if (input.currency !== undefined) {
    patch.currency = String(input.currency ?? "XAF")
      .trim()
      .toUpperCase();
  }
  if (input.currencySymbol !== undefined) {
    patch.currencySymbol = String(input.currencySymbol ?? "CFA").trim();
  }
  if (input.defaultMethod !== undefined) {
    const allowed = [
      "cash_on_delivery",
      "card",
      "bank_transfer",
      "mobile_money",
    ];
    patch.defaultMethod = allowed.includes(input.defaultMethod)
      ? input.defaultMethod
      : "cash_on_delivery";
  }
  if (input.testMode !== undefined) patch.testMode = !!input.testMode;

  const updated = await PaymentSettings.findOneAndUpdate(
    { key: KEY },
    { $set: patch, $setOnInsert: { key: KEY } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  res.json({ success: true, data: serialize(updated) });
}
