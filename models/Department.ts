import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface IDepartment {
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type DepartmentModel = Model<IDepartment>;
export type DepartmentDoc = HydratedDocument<IDepartment>;

const DepartmentSchema = new Schema<IDepartment, DepartmentModel>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const Department: DepartmentModel =
  (mongoose.models.Department as DepartmentModel | undefined) ??
  (mongoose.model(
    "Department",
    DepartmentSchema,
  ) as unknown as DepartmentModel);

export default Department;
