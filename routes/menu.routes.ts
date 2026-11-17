import { Router } from "express";
import {
  createMenu,
  deleteMenu,
  deleteMenuBackgroundImage,
  deleteMenuImage,
  getAllMenus,
  getMenuById,
  getMenuRefOptions,
  getMenusByLocation,
  updateMenu,
} from "../controllers/menu.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const menuRouter = Router();

// Public — storefront renders header/footer/banner/mobile menus.
menuRouter.get("/location/:location", asyncHandler(getMenusByLocation));

// Admin only.
const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.get("/", asyncHandler(getAllMenus));
adminRouter.post("/", asyncHandler(createMenu));
adminRouter.get("/ref-options", asyncHandler(getMenuRefOptions));
adminRouter.get("/:id", asyncHandler(getMenuById));
adminRouter.patch("/:id", asyncHandler(updateMenu));
adminRouter.delete("/:id", asyncHandler(deleteMenu));
adminRouter.delete("/:id/background", asyncHandler(deleteMenuBackgroundImage));
adminRouter.delete("/:id/image", asyncHandler(deleteMenuImage));

menuRouter.use(adminRouter);
