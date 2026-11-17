import { Router } from "express";
import {
  createAddress,
  deleteAddress,
  getUserAddresses,
  setDefaultAddress,
  updateAddress,
} from "../controllers/address.controller.js";
import { requireUser } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const addressRouter = Router();

// All address operations are scoped to the authenticated user.
addressRouter.use(requireUser);

addressRouter.get("/", asyncHandler(getUserAddresses));
addressRouter.post("/", asyncHandler(createAddress));
addressRouter.patch("/:id", asyncHandler(updateAddress));
addressRouter.delete("/:id", asyncHandler(deleteAddress));
addressRouter.patch("/:id/default", asyncHandler(setDefaultAddress));
