import { Router } from "express";
import {
  calculateShippingPrice,
  createCarrier,
  deleteCarrier,
  getCarrierById,
  getCarriers,
  updateCarrier,
} from "../controllers/carrier.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const carrierRouter = Router();
carrierRouter.use(requireAdmin);

carrierRouter.get("/", asyncHandler(getCarriers));
carrierRouter.post("/", asyncHandler(createCarrier));
carrierRouter.post("/calculate-shipping", asyncHandler(calculateShippingPrice));
carrierRouter.get("/:id", asyncHandler(getCarrierById));
carrierRouter.patch("/:id", asyncHandler(updateCarrier));
carrierRouter.delete("/:id", asyncHandler(deleteCarrier));
