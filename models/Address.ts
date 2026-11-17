import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export interface IAddress {
  userId: Types.ObjectId;
  label: string;
  street: string;
  city: string;
  state?: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type AddressModel = Model<IAddress>;
export type AddressDoc = HydratedDocument<IAddress>;

const AddressSchema = new Schema<IAddress, AddressModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    label: { type: String, required: true, trim: true, default: "Default" },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, default: null },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: "Cameroon" },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

AddressSchema.index({ userId: 1, isDefault: -1 });

// Keep only one default per user.
// `this.constructor` is the model this doc belongs to — avoids referencing
// `Address` before its declaration, which TS flags but JS allowed by TDZ laxness.
AddressSchema.pre("save", async function (this: AddressDoc) {
  if (!this.isDefault) return;
  const Model = this.constructor as AddressModel;
  await Model.updateMany(
    { userId: this.userId, _id: { $ne: this._id } },
    { isDefault: false },
  );
});

const Address: AddressModel =
  (mongoose.models.Address as AddressModel | undefined) ??
  (mongoose.model("Address", AddressSchema) as unknown as AddressModel);

export default Address;
