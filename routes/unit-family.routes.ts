import { Router } from "express";
import {
  createUnitFamily,
  deleteUnitFamily,
  getUnitFamilies,
  updateUnitFamily,
} from "../controllers/unit-family.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const unitFamilyRouter = Router();
unitFamilyRouter.use(requireAdmin);

unitFamilyRouter.get("/", asyncHandler(getUnitFamilies));
unitFamilyRouter.post("/", asyncHandler(createUnitFamily));
unitFamilyRouter.patch("/:id", asyncHandler(updateUnitFamily));
unitFamilyRouter.delete("/:id", asyncHandler(deleteUnitFamily));
