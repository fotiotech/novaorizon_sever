import { Router } from "express";
import {
  createFacebookAd,
  createFacebookAdCreative,
  createFacebookAdSet,
  createFacebookCampaign,
  getAdSetInsights,
  getCampaignInsights,
  getFacebookAdsSettings,
  loadFacebookAdsSettings,
  saveFacebookAdsSettings,
  syncFacebookAdSets,
  syncFacebookCampaigns,
  syncFacebookCatalogProducts,
  validateFacebookAdsConnection,
} from "../controllers/facebook-ads.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const facebookAdsRouter = Router();
facebookAdsRouter.use(requireAdmin);

facebookAdsRouter.get("/settings", asyncHandler(getFacebookAdsSettings));
facebookAdsRouter.get(
  "/settings/masked",
  asyncHandler(loadFacebookAdsSettings),
);
facebookAdsRouter.put("/settings", asyncHandler(saveFacebookAdsSettings));
facebookAdsRouter.post(
  "/settings/validate",
  asyncHandler(validateFacebookAdsConnection),
);

facebookAdsRouter.post("/sync/campaigns", asyncHandler(syncFacebookCampaigns));
facebookAdsRouter.post("/sync/adsets", asyncHandler(syncFacebookAdSets));
facebookAdsRouter.post(
  "/sync/catalog",
  asyncHandler(syncFacebookCatalogProducts),
);

facebookAdsRouter.post("/campaigns", asyncHandler(createFacebookCampaign));
facebookAdsRouter.post("/adsets", asyncHandler(createFacebookAdSet));
facebookAdsRouter.post("/creatives", asyncHandler(createFacebookAdCreative));
facebookAdsRouter.post("/ads", asyncHandler(createFacebookAd));

facebookAdsRouter.get(
  "/insights/campaigns/:campaignId",
  asyncHandler(getCampaignInsights),
);
facebookAdsRouter.get(
  "/insights/adsets/:adSetId",
  asyncHandler(getAdSetInsights),
);
