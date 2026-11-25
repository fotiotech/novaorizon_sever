import { Router } from "express";
import {
  getIntegrationSecrets,
  updateIntegrationSecrets,
} from "../controllers/integration.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const integrationRouter = Router();
integrationRouter.use(requireAdmin);
integrationRouter.get("/secrets", asyncHandler(getIntegrationSecrets));
integrationRouter.put("/secrets", asyncHandler(updateIntegrationSecrets));
