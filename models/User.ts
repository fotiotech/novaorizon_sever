import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";

/* ------------------------------- Interfaces ------------------------------- */

export interface IWishlistItem {
  product: Types.ObjectId;
  variantId?: Types.ObjectId | null;
  sku?: string | null;
  priceAtAdd?: number | null;
  currency?: string | null;
  notifyOnPriceDrop: boolean;
  notifyOnRestock: boolean;
  note?: string | null;
}

export interface IUser {
  email: string;
  password: string;
  emailVerified?: Date | null;
  isVerified: boolean;
  verificationToken?: string | null;
  tokenExpiry?: Date | null;
  resetPasswordToken?: string | null;
  resetPasswordExpiry?: Date | null;

  role: "customer" | "seller" | "admin" | "support";
  permissions: string[];
  accounts: any[];
  sessions: any[];

  name?: string | null;
  image?: string | null;
  dateOfBirth?: Date | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  profileCompleted: boolean;
  onboardingCompleted: boolean;

  phone: {
    countryCode?: string | null;
    number?: string | null;
    e164?: string | null;
  };
  phoneVerified: boolean;
  phoneVerifiedAt?: Date | null;

  wishlist: IWishlistItem[];

  loyalty: {
    points: number;
    tier: "bronze" | "silver" | "gold" | "platinum";
    lifetimePoints: number;
  };
  walletBalance: number;
  referralCode?: string;
  referredBy?: Types.ObjectId | null;

  preferences: {
    language: string;
    currency: string;
    theme: "light" | "dark" | "system";
    timezone: string;
    country?: string | null;
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
      whatsapp: boolean;
    };
    marketing: {
      email: boolean;
      sms: boolean;
      push: boolean;
      whatsapp: boolean;
      productRecommendations: boolean;
    };
    priceDropAlerts: boolean;
    backInStockAlerts: boolean;
    consentedAt?: Date | null;
    unsubscribedAt?: Date | null;
  };

  status: "active" | "inactive" | "suspended" | "pending";
  lastLoginAt?: Date | null;
  loginCount: number;
  deletedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  matchPassword(enteredPassword: string): Promise<boolean>;
  isWishlisted(productId: Types.ObjectId): boolean;
  canReceive(
    channel: "email" | "sms" | "push" | "whatsapp",
    type: "marketing" | "notifications",
  ): boolean;
}

export type UserModel = Model<IUser, {}, IUserMethods>;
export type UserDoc = HydratedDocument<IUser, IUserMethods>;

/* ------------------------------- Sub-schema ------------------------------- */

const WishlistItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variantId: { type: Schema.Types.ObjectId, default: null },
    sku: { type: String, trim: true, default: null },
    priceAtAdd: { type: Number, default: null },
    currency: { type: String, uppercase: true, default: null },
    notifyOnPriceDrop: { type: Boolean, default: false },
    notifyOnRestock: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 300, default: null },
  },
  { _id: true, timestamps: true },
);

/* --------------------------------- Schema --------------------------------- */

const UserSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    emailVerified: { type: Date, default: null },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String, default: null, select: false },
    tokenExpiry: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null, select: false },
    resetPasswordExpiry: { type: Date, default: null },

    role: {
      type: String,
      enum: ["customer", "seller", "admin", "support"],
      default: "customer",
      index: true,
    },
    permissions: { type: [String], default: [] },

    // `Schema.Types.Mixed` accepts any value (including arrays) at runtime.
    // `default: []` ensures a new user starts with an empty array.
    // Declared as Mixed (not [Mixed]) so the field type-checks under the
    // generic `Schema<IUser, UserModel, IUserMethods>` signature.
    accounts: { type: Schema.Types.Mixed, default: [] },
    sessions: { type: Schema.Types.Mixed, default: [] },

    name: { type: String, trim: true, default: null },
    image: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say", null],
      default: null,
    },
    profileCompleted: { type: Boolean, default: false },
    onboardingCompleted: { type: Boolean, default: false },

    phone: {
      countryCode: { type: String, trim: true, default: null },
      number: { type: String, trim: true, default: null },
      e164: { type: String, trim: true, default: null },
    },
    phoneVerified: { type: Boolean, default: false },
    phoneVerifiedAt: { type: Date, default: null },

    wishlist: { type: [WishlistItemSchema], default: [] },

    loyalty: {
      points: { type: Number, default: 0, min: 0 },
      tier: {
        type: String,
        enum: ["bronze", "silver", "gold", "platinum"],
        default: "bronze",
      },
      lifetimePoints: { type: Number, default: 0, min: 0 },
    },
    walletBalance: { type: Number, default: 0, min: 0 },
    referralCode: { type: String, unique: true, sparse: true, trim: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    preferences: {
      language: { type: String, default: "en", lowercase: true, trim: true },
      currency: { type: String, default: "xaf", uppercase: true, trim: true },
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      timezone: { type: String, default: "UTC" },
      country: { type: String, default: null, uppercase: true, trim: true },
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: false },
      },
      marketing: {
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: false },
        whatsapp: { type: Boolean, default: false },
        productRecommendations: { type: Boolean, default: false },
      },
      priceDropAlerts: { type: Boolean, default: false },
      backInStockAlerts: { type: Boolean, default: false },
      consentedAt: { type: Date, default: null },
      unsubscribedAt: { type: Date, default: null },
    },

    status: {
      type: String,
      enum: ["active", "inactive", "suspended", "pending"],
      default: "active",
      index: true,
    },
    lastLoginAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, any>) {
        delete ret.password;
        delete ret.verificationToken;
        delete ret.resetPasswordToken;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(_doc, ret: Record<string, any>) {
        delete ret.password;
        delete ret.verificationToken;
        delete ret.resetPasswordToken;
        delete ret.__v;
        return ret;
      },
    },
  },
);

/* --------------------------------- Indexes -------------------------------- */

UserSchema.index(
  { "phone.e164": 1 },
  {
    unique: true,
    partialFilterExpression: { "phone.e164": { $type: "string" } },
  },
);
UserSchema.index({ "wishlist.product": 1 });
UserSchema.index({ createdAt: -1 });

/* --------------------------------- Hooks ---------------------------------- */

UserSchema.pre("save", async function (this: UserDoc) {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  if (this.emailVerified) this.isVerified = true;
  if (this.phone?.number && !this.phone.e164) {
    this.phone.e164 = `${this.phone.countryCode ?? ""}${this.phone.number}`;
  }
  if (!this.referralCode) {
    this.referralCode = generateReferralCode(this.email);
  }
});

/* -------------------------------- Methods --------------------------------- */
/* The `as any` suffix is a documented mongoose 8 typing workaround:
   the body is fully type-checked (via `this: UserDoc`), but the assignment
   skips mongoose's over-strict `this` variance check on the methods bag.   */

UserSchema.methods.matchPassword = function (
  this: UserDoc,
  enteredPassword: string,
) {
  return bcrypt.compare(enteredPassword, this.password);
} as any;

UserSchema.methods.isWishlisted = function (
  this: UserDoc,
  productId: Types.ObjectId,
) {
  return this.wishlist.some(
    (item: IWishlistItem) => String(item.product) === String(productId),
  );
} as any;

UserSchema.methods.canReceive = function (
  this: UserDoc,
  channel: "email" | "sms" | "push" | "whatsapp",
  type: "marketing" | "notifications",
) {
  if (this.status !== "active" || this.deletedAt) return false;
  return Boolean((this.preferences as any)?.[type]?.[channel]);
} as any;

/* -------------------------------- Helpers --------------------------------- */

function generateReferralCode(email: string): string {
  const base = (email ?? "user").split("@")[0].replace(/[^a-z0-9]/gi, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base.slice(0, 6).toUpperCase()}${rand}`;
}

/* --------------------------------- Model ---------------------------------- */
/*
 * `model()` in mongoose 8 does not always infer the same `Model<>` generic
 * that `Schema<IUser, UserModel, IUserMethods>` was declared with, and the
 * `models.User` cache is typed as `Model<any>`. The two casts below are the
 * standard workaround so both branches of the `??` narrow to `UserModel`.
 */
const User: UserModel =
  (mongoose.models.User as UserModel | undefined) ??
  (mongoose.model("User", UserSchema as any) as unknown as UserModel);

export default User;