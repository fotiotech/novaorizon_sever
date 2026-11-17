import { Router } from "express";
import {
  createUnit,
  deleteUnit,
  getUnits,
  updateUnit,
} from "../controllers/unit.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const unitRouter = Router();
unitRouter.use(requireAdmin);

unitRouter.get("/", asyncHandler(getUnits));
unitRouter.post("/", asyncHandler(createUnit));
unitRouter.patch("/:id", asyncHandler(updateUnit));
unitRouter.delete("/:id", asyncHandler(deleteUnit));
