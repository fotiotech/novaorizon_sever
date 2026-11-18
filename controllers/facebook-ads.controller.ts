// Express types are aliased so they cannot shadow the Fetch API's global
// `Request`/`Response` (the production/ Vercel TS build includes DOM libs).
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import Product from "../models/Product.js";
import { connection } from "../config/db.js";
import {
  FacebookAdsConnectionSchema,
  SECRET_MASK,
  SENSITIVE_FIELDS,
  maskSecrets,
} from "../utils/facebook-ads.js";
import {
  getSecret,
  putSecret,
  invalidateSecretCache,
} from "../utils/aws-secrets.js";

/* ---------------------------- json helper ------------------------------- */

/**
 * `Response.json()` is typed as `Promise<unknown>` since @types/node v20
 * and TS 5.3's DOM lib. Every call site in this file immediately reads
 * known fields off the parsed body (`.data`, `.error`, `.id`, `.sid`),
 * so we cast to `any` once here rather than 9 times at the call sites.
 */
async function readJson<T = any>(r: { json(): Promise<unknown> }): Promise<T> {
  return r.json() as Promise<T>;
}

const SITE_URL =
  process.env.FRONTEND_URL?.replace(/\/$/, "") || "http://localhost:3000";

/* ---------------------------- validation -------------------------------- */

export async function validateFacebookAdsConnection(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const parsed = FacebookAdsConnectionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.json({
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
      message: "Please complete the required Facebook Ads connection fields.",
    });
    return;
  }
  res.json({
    ok: true,
    message:
      "Connection settings look valid. They will be stored securely in AWS Secrets Manager.",
  });
}

/* ---------------------------- read / write ------------------------------ */

/**
 * Admin — full settings. Supports `?raw=true` to bypass secret masking
 * (useful for display-only tooling that needs to confirm what's stored).
 */
export async function getFacebookAdsSettings(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const raw = req.query.raw === "true";
  const settings = await getSecret();
  if (!settings) {
    res.json({ data: null });
    return;
  }
  res.json({ data: raw ? settings : maskSecrets(settings) });
}

/**
 * Admin — masked settings only. Always redacts sensitive fields.
 * Used by the settings page in the admin UI.
 */
export async function loadFacebookAdsSettings(
  _req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings = await getSecret();
  res.json({ data: settings ? maskSecrets(settings) : null });
}

export async function saveFacebookAdsSettings(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const input = req.body ?? {};
  const existing = (await getSecret()) ?? {};

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === SECRET_MASK) continue;
    if (
      (SENSITIVE_FIELDS as readonly string[]).includes(key) &&
      (value === "" || value === undefined) &&
      existing[key]
    ) {
      continue;
    }
    cleaned[key] = value;
  }

  const merged = {
    ...existing,
    ...cleaned,
    updatedAt: new Date().toISOString(),
  };
  const validated = FacebookAdsConnectionSchema.safeParse(merged);
  if (!validated.success) {
    res.json({
      ok: false,
      message: "Invalid Facebook Ads connection data.",
      errors: validated.error.flatten().fieldErrors,
    });
    return;
  }

  await putSecret(validated.data as Record<string, unknown>);
  invalidateSecretCache();
  res.json({
    ok: true,
    data: maskSecrets(validated.data),
    message: "Facebook Ads settings saved.",
  });
}

/* ---------------------------- sync endpoints ---------------------------- */

export async function syncFacebookCampaigns(
  _req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings: any = await getSecret();
  if (!settings) {
    res.json({
      ok: false,
      message: "No Facebook Ads connection is configured yet.",
      campaigns: [],
    });
    return;
  }

  const r = await fetch(
    `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${settings.adAccountId}/campaigns?fields=id,name,status,objective,configured_status,created_time&access_token=${encodeURIComponent(settings.accessToken as string)}`,
  );
  if (!r.ok) {
    const err = await r.text();
    res.json({
      ok: false,
      message: `Facebook API error: ${err}`,
      campaigns: [],
    });
    return;
  }
  const payload = await readJson(r);
  const campaigns = Array.isArray(payload.data) ? payload.data : [];
  res.json({
    ok: true,
    message: `Fetched ${campaigns.length} campaign(s).`,
    campaigns,
  });
}

export async function syncFacebookAdSets(
  _req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings: any = await getSecret();
  if (!settings) {
    res.json({
      ok: false,
      message: "No Facebook Ads connection is configured yet.",
      adSets: [],
    });
    return;
  }

  const r = await fetch(
    `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${settings.adAccountId}/adsets?fields=id,name,campaign_id,status,created_time&access_token=${encodeURIComponent(settings.accessToken as string)}`,
  );
  if (!r.ok) {
    const err = await r.text();
    res.json({ ok: false, message: `Facebook API error: ${err}`, adSets: [] });
    return;
  }
  const payload = await readJson(r);
  const adSets = Array.isArray(payload.data) ? payload.data : [];
  res.json({
    ok: true,
    message: `Fetched ${adSets.length} ad set(s).`,
    adSets,
  });
}

export async function syncFacebookCatalogProducts(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings: any = await getSecret();
  if (!settings) {
    res.json({ ok: false, message: "No connection.", synced: 0 });
    return;
  }
  if (!settings.catalogId) {
    res.json({
      ok: false,
      message: "No Meta catalog ID configured.",
      synced: 0,
    });
    return;
  }

  await connection();
  const limit = Math.min(100, Math.max(1, Number(req.body?.limit) || 25));
  const products = await Product.find({}).limit(limit).lean();

  const items = products
    .map((p: any) => ({
      retailer_id: p._id?.toString() || p.name,
      name: p.name || "Product",
      description: p.description || p.shortDescription || "Product",
      price: Number(p.price) || 0,
      currency: "USD",
      image_url: p.images?.[0] || "",
      link: `${SITE_URL}/products/${p.slug ?? p._id}`,
      product_type: p.categoryName || "General",
    }))
    .filter((i) => i.name && i.retailer_id);

  let synced = 0;
  const errors: string[] = [];
  for (const item of items) {
    const params = new URLSearchParams({
      access_token: settings.accessToken,
      retailer_id: String(item.retailer_id),
      name: item.name,
      description: item.description,
      price: String(item.price),
      currency: item.currency,
      product_type: item.product_type,
    });
    if (item.image_url) params.set("image_url", item.image_url);
    if (item.link) params.set("link", item.link);

    const r = await fetch(
      `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${settings.catalogId}/products`,
      {
        method: "POST",
        body: params,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
    const payload = await readJson(r);
    if (!r.ok || payload.error) {
      errors.push(payload?.error?.message || "Unknown error");
      continue;
    }
    synced += 1;
  }

  res.json({
    ok: synced > 0,
    message:
      synced > 0
        ? `Synced ${synced} product(s).`
        : errors[0] || "No products synced.",
    synced,
    errors,
  });
}

/* ----------------------------- create ops ------------------------------- */

const OBJECTIVE_MAP: Record<string, string> = {
  sales: "OUTCOME_SALES",
  leads: "OUTCOME_LEADS",
  traffic: "OUTCOME_TRAFFIC",
  awareness: "OUTCOME_AWARENESS",
  engagement: "OUTCOME_ENGAGEMENT",
  catalog_sales: "OUTCOME_CATALOG_SALES",
};
const STATUS_MAP = { ACTIVE: 1, PAUSED: 2 } as const;

export async function createFacebookCampaign(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings: any = await getSecret();
  if (!settings) {
    res.json({ ok: false, message: "No connection.", campaign: null });
    return;
  }

  const { name, objective, status } = req.body ?? {};
  if (!name?.trim()) {
    res.json({
      ok: false,
      message: "Campaign name is required.",
      campaign: null,
    });
    return;
  }

  const selectedObjective = (objective ||
    settings.defaultObjective ||
    "sales") as string;
  const body = new URLSearchParams({
    access_token: settings.accessToken,
    name: name.trim(),
    objective: OBJECTIVE_MAP[selectedObjective] ?? "OUTCOME_SALES",
    status: String(STATUS_MAP[(status as "ACTIVE" | "PAUSED") || "PAUSED"]),
  });

  const r = await fetch(
    `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${settings.adAccountId}/campaigns`,
    {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );
  const payload = await readJson(r);
  if (!r.ok || payload.error) {
    res.json({
      ok: false,
      message: payload?.error?.message || "Failed to create campaign.",
      campaign: null,
    });
    return;
  }
  res.json({ ok: true, message: "Campaign created.", campaign: payload });
}

export async function createFacebookAdSet(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings: any = await getSecret();
  if (!settings) {
    res.json({ ok: false, message: "No connection.", adSet: null });
    return;
  }

  const {
    name,
    campaignId,
    status,
    dailyBudget,
    optimizationGoal,
    billingEvent,
    targeting,
  } = req.body ?? {};
  if (!name?.trim() || !campaignId) {
    res.json({
      ok: false,
      message: "Name and campaign ID required.",
      adSet: null,
    });
    return;
  }

  const body = new URLSearchParams({
    access_token: settings.accessToken,
    name: name.trim(),
    campaign_id: campaignId,
    optimization_goal: optimizationGoal || "LINK_CLICKS",
    billing_event: billingEvent || "IMPRESSIONS",
    status: String(STATUS_MAP[(status as "ACTIVE" | "PAUSED") || "PAUSED"]),
    daily_budget: String(Number(dailyBudget ?? 1000) * 100),
  });
  if (
    targeting &&
    typeof targeting === "object" &&
    Object.keys(targeting).length > 0
  ) {
    body.set("targeting", JSON.stringify(targeting));
  }

  const r = await fetch(
    `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${settings.adAccountId}/adsets`,
    {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );
  const payload = await readJson(r);
  if (!r.ok || payload.error) {
    res.json({
      ok: false,
      message: payload?.error?.message || "Failed to create ad set.",
      adSet: null,
    });
    return;
  }
  res.json({ ok: true, message: "Ad set created.", adSet: payload });
}

export async function createFacebookAdCreative(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings: any = await getSecret();
  if (!settings) {
    res.json({ ok: false, message: "No connection.", creative: null });
    return;
  }

  const { name, pageId, headline, body, linkUrl, imageUrl, callToAction } =
    req.body ?? {};
  if (!name?.trim() || !linkUrl) {
    res.json({
      ok: false,
      message: "Name and link URL required.",
      creative: null,
    });
    return;
  }

  const pageIdValue = pageId || settings.pageId;
  if (!pageIdValue) {
    res.json({
      ok: false,
      message: "Meta page ID required.",
      creative: null,
    });
    return;
  }

  const cta = callToAction || "SHOP_NOW";
  const payload = {
    access_token: settings.accessToken,
    name: name.trim(),
    image_url: imageUrl || "",
    title: headline || "Shop now",
    body: body || "Explore our latest products.",
    link_url: linkUrl,
    call_to_action: { type: cta, value: { link: linkUrl } },
    object_story_spec: {
      page_id: pageIdValue,
      link_data: {
        link: linkUrl,
        image_url: imageUrl || "",
        message: body || "Explore our latest products.",
        call_to_action: { type: cta, value: { link: linkUrl } },
      },
    },
  };

  const r = await fetch(
    `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${pageIdValue}/adcreatives`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const result = await readJson(r);
  if (!r.ok || result.error) {
    res.json({
      ok: false,
      message: result?.error?.message || "Failed to create creative.",
      creative: null,
    });
    return;
  }
  res.json({ ok: true, message: "Creative created.", creative: result });
}

export async function createFacebookAd(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings: any = await getSecret();
  if (!settings) {
    res.json({ ok: false, message: "No connection.", ad: null });
    return;
  }

  const { name, adSetId, creativeId, status } = req.body ?? {};
  if (!name?.trim() || !adSetId || !creativeId) {
    res.json({
      ok: false,
      message: "Name, ad set ID, and creative ID required.",
      ad: null,
    });
    return;
  }

  const r = await fetch(
    `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${settings.adAccountId}/ads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: settings.accessToken,
        name: name.trim(),
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: STATUS_MAP[(status as "ACTIVE" | "PAUSED") || "PAUSED"],
      }),
    },
  );
  const payload = await readJson(r);
  if (!r.ok || payload.error) {
    res.json({
      ok: false,
      message: payload?.error?.message || "Failed to create ad.",
      ad: null,
    });
    return;
  }
  res.json({ ok: true, message: "Ad created.", ad: payload });
}

/* ----------------------------- insights --------------------------------- */

function parseInsights(data: any) {
  return {
    spend: parseFloat(data.spend || "0"),
    impressions: parseInt(data.impressions || "0"),
    clicks: parseInt(data.clicks || "0"),
    ctr: parseFloat(data.ctr || "0"),
    cpc: parseFloat(data.cpc || "0"),
    conversions:
      data.actions?.find((a: any) => a.action_type === "omni_purchase")
        ?.value || 0,
  };
}

export async function getCampaignInsights(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings: any = await getSecret();
  const campaignId = req.params.campaignId;
  if (!settings) {
    res.json({ ok: false, message: "No connection.", insights: null });
    return;
  }
  if (!campaignId) {
    res.json({ ok: false, message: "Campaign ID required.", insights: null });
    return;
  }

  const fields = encodeURIComponent(
    "spend,impressions,clicks,actions,action_values,cost_per_action_type,ctr,cpp,cpc",
  );
  const r = await fetch(
    `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${campaignId}/insights?fields=${fields}&access_token=${encodeURIComponent(settings.accessToken)}`,
  );
  if (!r.ok) {
    res.json({ ok: false, message: await r.text(), insights: null });
    return;
  }

  const payload = await readJson(r);
  const data = Array.isArray(payload.data) ? payload.data[0] : null;
  if (!data) {
    res.json({
      ok: true,
      message: "No insights data yet.",
      insights: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        conversions: 0,
      },
    });
    return;
  }
  res.json({
    ok: true,
    message: "Campaign insights retrieved.",
    insights: parseInsights(data),
  });
}

export async function getAdSetInsights(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const settings: any = await getSecret();
  const adSetId = req.params.adSetId;
  if (!settings) {
    res.json({ ok: false, message: "No connection.", insights: null });
    return;
  }
  if (!adSetId) {
    res.json({ ok: false, message: "Ad set ID required.", insights: null });
    return;
  }

  const fields = encodeURIComponent(
    "spend,impressions,clicks,actions,cost_per_action_type,ctr,cpc",
  );
  const r = await fetch(
    `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${adSetId}/insights?fields=${fields}&access_token=${encodeURIComponent(settings.accessToken)}`,
  );
  if (!r.ok) {
    res.json({ ok: false, message: await r.text(), insights: null });
    return;
  }

  const payload = await readJson(r);
  const data = Array.isArray(payload.data) ? payload.data[0] : null;
  if (!data) {
    res.json({
      ok: true,
      message: "No insights data yet.",
      insights: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        conversions: 0,
      },
    });
    return;
  }
  res.json({
    ok: true,
    message: "Ad set insights retrieved.",
    insights: parseInsights(data),
  });
}