import { Router } from "express";
import {
  deleteS3Upload,
  uploadSingle,
  uploadToS3,
} from "../controllers/upload.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const uploadRouter = Router();

// `requireAdmin` before `uploadSingle` so unauth requests are rejected
// before we buffer the file into memory.
uploadRouter.post("/s3", requireAdmin, uploadSingle, asyncHandler(uploadToS3));uploadRouter.delete("/s3", requireAdmin, asyncHandler(deleteS3Upload));
