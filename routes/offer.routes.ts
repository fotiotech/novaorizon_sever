import { Router } from "express";
import {
  createOffer,
  deleteOffer,
  readOffers,
  updateOffer,
} from "../controllers/offer.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const offerRouter = Router();
offerRouter.use(requireAdmin);

offerRouter.get("/", asyncHandler(readOffers));
offerRouter.post("/", asyncHandler(createOffer));
offerRouter.patch("/:id", asyncHandler(updateOffer));
offerRouter.delete("/:id", asyncHandler(deleteOffer));
