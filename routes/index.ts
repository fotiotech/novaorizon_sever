import { Router } from "express";
import { addressRouter } from "./address.routes.js";
import { attributeRouter } from "./attribute.routes.js";
import { attributeGroupRouter } from "./attribute-group.routes.js";
import { attributeSetRouter } from "./attribute-set.routes.js";
import { authRouter } from "./auth.routes.js";
import { brandRouter } from "./brand.routes.js";
import { carrierRouter } from "./carrier.routes.js";
import { cartRouter } from "./cart.routes.js";
import { categoryRouter } from "./category.routes.js";
import { categoryPropertyRouter } from "./category-property.routes.js";
import { categoryPropertyDraftRouter } from "./category-property-draft.routes.js";
import { contactRouter } from "./contact.routes.js";
import { draftRouter } from "./draft.routes.js";
import { healthRouter } from "./health.routes.js";
import { inventoryRouter } from "./inventory.routes.js"; // ← new
import { invoiceRouter } from "./invoice.routes.js"; // ← new
import { newsletterRouter } from "./newsletter.routes.js"; // ← new
import { offerRouter } from "./offer.routes.js"; // ← new
import { orderRouter } from "./order.routes.js"; // ← new
import { paymentMethodRouter } from "./payment-method.routes.js"; // ← new
import { paymentSettingsRouter } from "./payment-settings.routes.js"; // ← new
import { productRouter } from "./product.routes.js";
import { unitFamilyRouter } from "./unit-family.routes.js";
import { unitRouter } from "./unit.routes.js";
import { userRouter } from "./user.routes.js";
import { menuRouter } from "./menu.routes.js";
import { metaTagRouter } from "./meta-tag.routes.js";
import { pageRouter } from "./page.routes.js";
import { promotionRouter } from "./promotion.routes.js";
import { seoRouter } from "./seo.routes.js";
import { settingRouter } from "./setting.routes.js";
import { shippingRouter } from "./shipping.routes.js";
import { trustBadgeRouter } from "./trust-badge.routes.js";
import { uploadRouter } from "./upload.routes.js";
import { searchRouter } from "./search.routes.js";
import { analyticRouter } from "./analytic.routes.js";
import { bannerContentRouter } from "./banner-content.routes.js";
import { heroContentRouter } from "./hero-content.routes.js";
import { campaignRouter } from "./campaign.routes.js";
import { facebookAdsRouter } from "./facebook-ads.routes.js";
import { blockRouter } from "./block.routes.js";
import { collectionRouter } from "./collection.routes.js";
import { monetbilRouter } from "./monetbil.routes.js";
import { eventRouter } from "./event.routes.js";
import { notificationRouter } from "./notification.routes.js";
import { catalogRouter } from "./catalog.routes.js";

export const apiRouter = Router();

apiRouter.use("/catalog", catalogRouter); // public storefront catalogue
apiRouter.use("/addresses", addressRouter);
apiRouter.use("/attributes", attributeRouter);
apiRouter.use("/attribute-groups", attributeGroupRouter);
apiRouter.use("/attribute-sets", attributeSetRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/brands", brandRouter);
apiRouter.use("/carriers", carrierRouter);
apiRouter.use("/cart", cartRouter);
apiRouter.use("/categories", categoryRouter);
apiRouter.use("/category-properties", categoryPropertyRouter);
apiRouter.use("/category-property-drafts", categoryPropertyDraftRouter);
apiRouter.use("/contact", contactRouter);
apiRouter.use("/drafts", draftRouter);
apiRouter.use("/health", healthRouter);
apiRouter.use("/inventory", inventoryRouter); // ← new
apiRouter.use("/invoices", invoiceRouter); // ← new
apiRouter.use("/newsletter", newsletterRouter); // ← new
apiRouter.use("/offers", offerRouter); // ← new
apiRouter.use("/orders", orderRouter); // ← new
apiRouter.use("/payment-methods", paymentMethodRouter); // ← new
apiRouter.use("/payment-settings", paymentSettingsRouter); // ← new
apiRouter.use("/products", productRouter);
apiRouter.use("/unit-families", unitFamilyRouter);
apiRouter.use("/units", unitRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/menus", menuRouter); // ← new
apiRouter.use("/meta-tags", metaTagRouter); // ← new
apiRouter.use("/pages", pageRouter); // ← new
apiRouter.use("/promotions", promotionRouter); // ← new
apiRouter.use("/search", searchRouter); // ← new
apiRouter.use("/seo", seoRouter); // ← new
apiRouter.use("/settings", settingRouter); // ← new
apiRouter.use("/shipping", shippingRouter); // ← new
apiRouter.use("/trust-badges", trustBadgeRouter); // ← new
apiRouter.use("/upload", uploadRouter); // ← new
apiRouter.use("/analytics", analyticRouter); // ← new
apiRouter.use("/banners", bannerContentRouter); // ← new
apiRouter.use("/hero-content", heroContentRouter); // ← new
apiRouter.use("/blocks", blockRouter);
apiRouter.use("/campaigns", campaignRouter);
apiRouter.use("/collections", collectionRouter);
apiRouter.use("/facebook-ads", facebookAdsRouter);
apiRouter.use("/monetbil", monetbilRouter);
apiRouter.use("/events", eventRouter);
apiRouter.use("/notifications", notificationRouter);