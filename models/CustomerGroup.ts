import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export interface ICustomerGroup {
  name: string;
  description?: string | null;
  customers: Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomerGroupModel = Model<ICustomerGroup>;
export type CustomerGroupDoc = HydratedDocument<ICustomerGroup>;

const CustomerGroupSchema = new Schema<ICustomerGroup, CustomerGroupModel>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: null },
    customers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const CustomerGroup: CustomerGroupModel =
  (mongoose.models.CustomerGroup as CustomerGroupModel | undefined) ??
  (mongoose.model(
    "CustomerGroup",
    CustomerGroupSchema,
  ) as unknown as CustomerGroupModel);

export { CustomerGroup };
export default CustomerGroup;
