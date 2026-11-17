import type { Request, Response } from "express";
import mongoose from "mongoose";
import NewsletterSubscriber from "../models/NewsletterSubscriber.js";
import MessageCampaign from "../models/MessageCampaign.js";
import MessageTemplate from "../models/MessageTemplate.js";
import MessageLog from "../models/MessageLog.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { env } from "../config/env.js";
import {
  sendEmail,
  sendSms,
  ProviderError,
} from "../utils/messaging/providers.js";
import {
  renderTemplate,
  extractVariables,
  wrapHtml,
  appendUnsubscribe,
  appendSmsOptOut,
  type RenderContext,
} from "../utils/messaging/render.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

const SITE_URL = env.frontendUrl.replace(/\/$/, "") || "http://localhost:3000";

/* ----------------------------- templates -------------------------------- */

export async function listTemplates(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const query: any = {};
  if (req.query.channel) query.channel = req.query.channel;
  if (req.query.isActive !== undefined)
    query.isActive = req.query.isActive === "true";
  const data = await MessageTemplate.find(query).sort({ createdAt: -1 }).lean();
  res.json({ data });
}

export async function getTemplate(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid template ID"] });
  await connection();
  const doc = await MessageTemplate.findById(id).lean();
  if (!doc) throw new AppError("Template not found", 404);
  res.json({ data: doc });
}

export async function createTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  const { name, channel, subject, previewText, body } = req.body ?? {};
  if (!name || !channel || !body) {
    throw new ValidationError({
      _form: ["name, channel, and body are required"],
    });
  }
  await connection();
  const variables = extractVariables(
    [subject, body].filter(Boolean).join("\n"),
  );
  const doc = await MessageTemplate.create({
    name,
    channel,
    subject,
    previewText,
    body,
    variables,
  });
  res.status(201).json({ data: doc.toObject() });
}

export async function updateTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid template ID"] });
  await connection();

  const input = req.body ?? {};
  const patch: any = { ...input };
  if (input.body !== undefined || input.subject !== undefined) {
    const existing: any = await MessageTemplate.findById(id).lean();
    if (!existing) throw new AppError("Template not found", 404);
    patch.variables = extractVariables(
      [input.subject ?? existing.subject, input.body ?? existing.body]
        .filter(Boolean)
        .join("\n"),
    );
  }
  const updated = await MessageTemplate.findByIdAndUpdate(
    id,
    { $set: patch },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw new AppError("Template not found", 404);
  res.json({ data: updated });
}

export async function deleteTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid template ID"] });
  await connection();
  const doc = await MessageTemplate.findByIdAndDelete(id);
  if (!doc) throw new AppError("Template not found", 404);
  res.json({ success: true });
}

/* ----------------------------- campaigns -------------------------------- */

export async function listCampaigns(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.channel) query.channel = req.query.channel;

  const [data, total] = await Promise.all([
    MessageCampaign.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MessageCampaign.countDocuments(query),
  ]);
  res.json({ data: { data, total, limit, skip } });
}

export async function getCampaign(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid campaign ID"] });
  await connection();
  const doc = await MessageCampaign.findById(id).lean();
  if (!doc) throw new AppError("Campaign not found", 404);
  res.json({ data: doc });
}

export async function createCampaign(
  req: Request,
  res: Response,
): Promise<void> {
  const { name, channel, subject, previewText, body, audience, templateId } =
    req.body ?? {};
  if (!name || !channel || !body) {
    throw new ValidationError({
      _form: ["name, channel, and body are required"],
    });
  }
  await connection();
  const doc = await MessageCampaign.create({
    name,
    channel,
    subject,
    previewText,
    body,
    audience,
    templateId: templateId || null,
    status: "draft",
  });
  res.status(201).json({ data: doc.toObject() });
}

export async function updateCampaign(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid campaign ID"] });
  await connection();

  const existing = await MessageCampaign.findById(id);
  if (!existing) throw new AppError("Campaign not found", 404);
  if (existing.status === "sending" || existing.status === "sent") {
    throw new AppError(
      "Cannot edit a campaign that is already sending or sent",
      409,
    );
  }

  const input = req.body ?? {};
  const patch: any = { ...input };
  if (input.scheduledFor !== undefined) {
    if (input.scheduledFor) {
      patch.scheduledFor = new Date(input.scheduledFor);
      patch.status = "scheduled";
    } else {
      patch.scheduledFor = null;
      patch.status = "draft";
    }
  }

  const updated = await MessageCampaign.findByIdAndUpdate(
    id,
    { $set: patch },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw new AppError("Campaign not found", 404);
  res.json({ data: updated });
}

export async function deleteCampaign(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid campaign ID"] });
  await connection();

  const existing = await MessageCampaign.findById(id).lean();
  if (!existing) throw new AppError("Campaign not found", 404);
  if (existing.status === "sending")
    throw new AppError(
      "Cannot delete a campaign that is currently sending",
      409,
    );

  await MessageCampaign.findByIdAndDelete(id);
  res.json({ success: true });
}

/* ------------------------ audience resolution --------------------------- */

function buildAudienceQuery(audience: any, channel: "email" | "sms") {
  const query: any = {};
  if (channel === "sms") {
    query.smsConsent = true;
    query.phone = { $ne: null };
  } else {
    query.email = { $ne: null };
  }

  if (audience?.status && audience.status !== "all")
    query.status = audience.status;
  else if (!audience?.status) query.status = "subscribed";

  if (Array.isArray(audience?.sources) && audience.sources.length > 0) {
    query.source = { $in: audience.sources };
  }
  if (audience?.joinedAfter || audience?.joinedBefore) {
    query.subscribedAt = {};
    if (audience.joinedAfter)
      query.subscribedAt.$gte = new Date(audience.joinedAfter);
    if (audience.joinedBefore)
      query.subscribedAt.$lte = new Date(audience.joinedBefore);
    if (Object.keys(query.subscribedAt).length === 0) delete query.subscribedAt;
  }
  if (
    Array.isArray(audience?.includeEmails) &&
    audience.includeEmails.length > 0
  ) {
    query.email = {
      $in: audience.includeEmails.map((e: string) => e.toLowerCase()),
    };
  }
  if (
    Array.isArray(audience?.excludeEmails) &&
    audience.excludeEmails.length > 0
  ) {
    query.email = {
      ...(query.email || {}),
      $nin: audience.excludeEmails.map((e: string) => e.toLowerCase()),
    };
  }
  return query;
}

export async function previewAudience(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid campaign ID"] });
  await connection();

  const campaign: any = await MessageCampaign.findById(id).lean();
  if (!campaign) throw new AppError("Campaign not found", 404);

  const query = buildAudienceQuery(campaign.audience, campaign.channel);
  const count = await NewsletterSubscriber.countDocuments(query);
  res.json({ data: { count } });
}

/* ------------------------------ send engine ----------------------------- */

const BATCH_SIZE = 40;

export async function sendCampaignBatch(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid campaign ID"] });
  await connection();

  const campaign: any = await MessageCampaign.findById(id);
  if (!campaign) throw new AppError("Campaign not found", 404);
  if (["sent", "cancelled", "failed"].includes(campaign.status)) {
    res.json({
      data: { done: true, processed: 0, sent: 0, failed: 0, remaining: 0 },
    });
    return;
  }

  if (campaign.status !== "sending") {
    campaign.status = "sending";
    await campaign.save();
  }

  const query: any = buildAudienceQuery(campaign.audience, campaign.channel);
  if (
    campaign.progress?.lastSubscriberId &&
    mongoose.Types.ObjectId.isValid(campaign.progress.lastSubscriberId)
  ) {
    query._id = {
      $gt: new mongoose.Types.ObjectId(campaign.progress.lastSubscriberId),
    };
  }

  const subscribers = await NewsletterSubscriber.find(query)
    .sort({ _id: 1 })
    .limit(BATCH_SIZE)
    .lean();
  if (subscribers.length === 0) {
    campaign.status = "sent";
    campaign.sentAt = new Date();
    campaign.progress.lastRunAt = new Date();
    await campaign.save();
    res.json({
      data: { done: true, processed: 0, sent: 0, failed: 0, remaining: 0 },
    });
    return;
  }

  let sent = 0,
    failed = 0;

  for (const sub of subscribers as any[]) {
    const recipient = campaign.channel === "sms" ? sub.phone : sub.email;
    if (!recipient) continue;

    const existing = await MessageLog.findOne({
      campaignId: campaign._id,
      recipient,
    }).lean();
    if (existing) continue;

    const unsubscribeUrl = `${SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken || "")}`;
    const ctx: RenderContext = {
      email: sub.email,
      phone: sub.phone,
      firstName: sub.firstName,
      lastName: sub.lastName,
      source: sub.source,
      unsubscribeUrl,
    };

    let log: any;
    try {
      log = await MessageLog.create({
        campaignId: campaign._id,
        channel: campaign.channel,
        recipient,
        subscriberId: sub._id,
        status: "queued",
      });
    } catch (err: any) {
      if (err?.code === 11000) continue;
      failed += 1;
      continue;
    }

    try {
      if (campaign.channel === "email") {
        const subject = renderTemplate(campaign.subject || "", ctx);
        const html = appendUnsubscribe(
          wrapHtml(renderTemplate(campaign.body, ctx)),
          unsubscribeUrl,
        );
        const result = await sendEmail({
          to: recipient,
          subject,
          html,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        log.status = "sent";
        log.sentAt = new Date();
        log.providerMessageId = result.providerMessageId;
        log.providerName = result.providerName;
        await log.save();
        sent += 1;
      } else {
        const body = appendSmsOptOut(renderTemplate(campaign.body, ctx));
        const result = await sendSms({ to: recipient, body });
        log.status = "sent";
        log.sentAt = new Date();
        log.providerMessageId = result.providerMessageId;
        log.providerName = result.providerName;
        await log.save();
        sent += 1;
      }
    } catch (err: any) {
      log.status = "failed";
      log.failedAt = new Date();
      log.error = err?.message || "Unknown send error";
      if (err instanceof ProviderError) log.providerName = err.providerName;
      await log.save();
      failed += 1;
    }
  }

  const lastSub = subscribers[subscribers.length - 1] as any;
  campaign.progress.lastSubscriberId = lastSub._id.toString();
  campaign.progress.processed += subscribers.length;
  campaign.progress.lastRunAt = new Date();
  campaign.stats.sent += sent;
  campaign.stats.failed += failed;
  campaign.stats.queued = Math.max(0, campaign.stats.queued - (sent + failed));

  const remainingQuery: any = buildAudienceQuery(
    campaign.audience,
    campaign.channel,
  );
  remainingQuery._id = {
    $gt: new mongoose.Types.ObjectId(campaign.progress.lastSubscriberId),
  };
  const remaining = await NewsletterSubscriber.countDocuments(remainingQuery);

  if (remaining === 0) {
    campaign.status = "sent";
    campaign.sentAt = new Date();
  }
  await campaign.save();

  res.json({
    data: {
      done: remaining === 0,
      processed: subscribers.length,
      sent,
      failed,
      remaining,
    },
  });
}

export async function startCampaignSend(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid campaign ID"] });
  await connection();

  const campaign: any = await MessageCampaign.findById(id).lean();
  if (!campaign) throw new AppError("Campaign not found", 404);
  if (campaign.status === "sent" || campaign.status === "sending") {
    throw new AppError(
      "Campaign has already been sent or is currently sending",
      409,
    );
  }
  if (!campaign.body?.trim())
    throw new AppError("Campaign has no body content", 400);
  if (campaign.channel === "email" && !campaign.subject?.trim()) {
    throw new AppError("Email campaigns require a subject", 400);
  }

  const audienceQuery = buildAudienceQuery(campaign.audience, campaign.channel);
  const total = await NewsletterSubscriber.countDocuments(audienceQuery);

  await MessageCampaign.findByIdAndUpdate(id, {
    $set: {
      status: "sending",
      "progress.lastSubscriberId": null,
      "progress.processed": 0,
      "stats.total": total,
      "stats.queued": total,
      "stats.sent": 0,
      "stats.failed": 0,
    },
  });
  res.json({ data: { total } });
}

export async function pauseCampaign(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid campaign ID"] });
  await connection();
  await MessageCampaign.findByIdAndUpdate(id, { $set: { status: "paused" } });
  res.json({ success: true });
}

export async function listCampaignLogs(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ValidationError({ id: ["Invalid campaign ID"] });
  await connection();

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const query: any = { campaignId: id };
  if (req.query.status) query.status = req.query.status;

  const [data, total] = await Promise.all([
    MessageLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MessageLog.countDocuments(query),
  ]);
  res.json({
    data: {
      data: data.map((l: any) => ({
        ...l,
        _id: l._id.toString(),
        campaignId: l.campaignId.toString(),
        subscriberId: l.subscriberId ? l.subscriberId.toString() : null,
      })),
      total,
      limit,
      skip,
    },
  });
}
