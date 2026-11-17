import { Router } from "express";
import {
  createHeroContent,
  deleteHeroContent,
  deleteHeroImage,
  findHeroContent,
  findHeroContentById,
  updateHeroContent,
} from "../controllers/hero-content.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const heroContentRouter = Router();
heroContentRouter.use(requireAdmin);

heroContentRouter.get("/", asyncHandler(findHeroContent));
heroContentRouter.post("/", asyncHandler(createHeroContent));
heroContentRouter.get("/:id", asyncHandler(findHeroContentById));
heroContentRouter.patch("/:id", asyncHandler(updateHeroContent));
heroContentRouter.delete("/:id", asyncHandler(deleteHeroContent));
heroContentRouter.post("/:id/images/delete", asyncHandler(deleteHeroImage));
