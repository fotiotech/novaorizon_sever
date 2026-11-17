import { Router } from "express";
import {
  createCampaign,
  createTemplate,
  deleteCampaign,
  deleteTemplate,
  getCampaign,
  getTemplate,
  listCampaignLogs,
  listCampaigns,
  listTemplates,
  pauseCampaign,
  previewAudience,
  sendCampaignBatch,
  startCampaignSend,
  updateCampaign,
  updateTemplate,
} from "../controllers/campaign.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const campaignRouter = Router();
campaignRouter.use(requireAdmin);

campaignRouter.get("/templates", asyncHandler(listTemplates));
campaignRouter.post("/templates", asyncHandler(createTemplate));
campaignRouter.get("/templates/:id", asyncHandler(getTemplate));
campaignRouter.patch("/templates/:id", asyncHandler(updateTemplate));
campaignRouter.delete("/templates/:id", asyncHandler(deleteTemplate));

campaignRouter.get("/", asyncHandler(listCampaigns));
campaignRouter.post("/", asyncHandler(createCampaign));
campaignRouter.get("/:id", asyncHandler(getCampaign));
campaignRouter.patch("/:id", asyncHandler(updateCampaign));
campaignRouter.delete("/:id", asyncHandler(deleteCampaign));

campaignRouter.get("/:id/audience", asyncHandler(previewAudience));
campaignRouter.post("/:id/send/start", asyncHandler(startCampaignSend));
campaignRouter.post("/:id/send/batch", asyncHandler(sendCampaignBatch));
campaignRouter.post("/:id/send/pause", asyncHandler(pauseCampaign));
campaignRouter.get("/:id/logs", asyncHandler(listCampaignLogs));
