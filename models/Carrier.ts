import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface ICarrierRegion {
  region: string;
  basePrice: number;
  averageDeliveryTime: string;
}

export interface ICarrier {
  name: string;
  contact: string;
  email: string;
  regionsServed: ICarrierRegion[];
  costWeight: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CarrierModel = Model<ICarrier>;
export type CarrierDoc = HydratedDocument<ICarrier>;

const RegionSchema = new Schema(
  {
    region: { type: String, required: true },
    basePrice: { type: Number, required: true },
    averageDeliveryTime: { type: String, required: true },
  },
  { _id: false },
);

const CarrierSchema = new Schema<ICarrier, CarrierModel>(
  {
    name: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true },
    regionsServed: { type: [RegionSchema], required: true },
    costWeight: { type: Number, required: true },
  },
  { timestamps: true },
);

const Carrier: CarrierModel =
  (mongoose.models.Carrier as CarrierModel | undefined) ??
  (mongoose.model("Carrier", CarrierSchema) as unknown as CarrierModel);

export default Carrier;
