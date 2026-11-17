import { Router } from "express";
import {
  createShipping,
  deleteShipping,
  getAllShippings,
  getShippingById,
  updateShipping,
} from "../controllers/shipping.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const shippingRouter = Router();
shippingRouter.use(requireAdmin);

shippingRouter.get("/", asyncHandler(getAllShippings));
shippingRouter.post("/", asyncHandler(createShipping));
shippingRouter.get("/:id", asyncHandler(getShippingById));
shippingRouter.patch("/:id", asyncHandler(updateShipping));
shippingRouter.delete("/:id", asyncHandler(deleteShipping));
