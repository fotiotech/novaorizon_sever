import { Router } from "express";
import {
  createOffer,
  deleteOffer,
  getEntityOffers,
  readOffers,
  syncEntityOffers,
  updateOffer,
} from "../controllers/offer.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const offerRouter = Router();
offerRouter.use(requireAdmin);

offerRouter.get("/", asyncHandler(readOffers));
offerRouter.get("/eligibility/:kind/:id", asyncHandler(getEntityOffers));
offerRouter.post("/eligibility/:kind/:id", asyncHandler(syncEntityOffers));
offerRouter.post("/", asyncHandler(createOffer));
offerRouter.patch("/:id", asyncHandler(updateOffer));
offerRouter.delete("/:id", asyncHandler(deleteOffer));