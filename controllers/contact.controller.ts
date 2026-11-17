import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import ContactMessage from "../models/ContactMessage.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { consumeRateLimit, getClientIp } from "../utils/rate-limit.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function toObjectIdOrThrow(id: string, field = "id"): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ [field]: [`Invalid ${field}`] });
  }
  return new mongoose.Types.ObjectId(id);
}

const submitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional(),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

/* ------------------------------ PUBLIC: submit --------------------------- */

export async function submitContactMessage(
  req: Request,
  res: Response,
): Promise<void> {
  const ip = getClientIp(req as any);
  const limit = consumeRateLimit(`contact:${ip}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    throw new AppError("Too many submissions. Try again later.", 429);
  }

  const parsed = submitSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors as any);
  }

  await connection();
  await ContactMessage.create({
    ...parsed.data,
    userId: req.user?.id ?? null,
    status: "new",
  });

  res.status(201).json({ success: true, message: "Message received." });
}

/* ---------------------------- ADMIN: list ------------------------------- */

export async function getContactMessages(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const {
    status,
    search,
    page = "1",
    limit = "10",
  } = req.query as Record<string, string | undefined>;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const query: Record<string, any> = {};
  if (status && status !== "all") query.status = status;
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [{ name: re }, { email: re }, { subject: re }, { message: re }];
  }

  const [messages, total, newCount, readCount, repliedCount, archivedCount] =
    await Promise.all([
      ContactMessage.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ContactMessage.countDocuments(query),
      ContactMessage.countDocuments({ status: "new" }),
      ContactMessage.countDocuments({ status: "read" }),
      ContactMessage.countDocuments({ status: "replied" }),
      ContactMessage.countDocuments({ status: "archived" }),
    ]);

  res.json({
    data: {
      messages: messages.map((m: any) => ({
        ...m,
        _id: m._id.toString(),
        createdAt: m.createdAt?.toISOString?.() ?? m.createdAt,
        updatedAt: m.updatedAt?.toISOString?.() ?? m.updatedAt,
      })),
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      counts: {
        all: newCount + readCount + repliedCount + archivedCount,
        new: newCount,
        read: readCount,
        replied: repliedCount,
        archived: archivedCount,
      },
    },
  });
}

export async function getContactMessageById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);
  await connection();

  const msg = await ContactMessage.findById(id).lean();
  if (!msg) throw new AppError("Message not found", 404);

  res.json({
    data: {
      ...msg,
      _id: (msg as any)._id.toString(),
      createdAt:
        (msg as any).createdAt?.toISOString?.() ?? (msg as any).createdAt,
      updatedAt:
        (msg as any).updatedAt?.toISOString?.() ?? (msg as any).updatedAt,
    },
  });
}

/* --------------------------- ADMIN: update status ----------------------- */

export async function updateContactStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);

  const status = req.body?.status as string;
  if (!["new", "read", "replied", "archived"].includes(status)) {
    throw new ValidationError({ status: ["Invalid status"] });
  }

  await connection();
  const updated = await ContactMessage.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true },
  );
  if (!updated) throw new AppError("Message not found", 404);

  res.json({
    success: true,
    data: { _id: updated._id.toString(), status: updated.status },
  });
}

export async function getNewContactCount(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const count = await ContactMessage.countDocuments({ status: "new" });
  res.json({ data: { count } });
}

export async function deleteContactMessage(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  toObjectIdOrThrow(id);
  await connection();
  const deleted = await ContactMessage.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Message not found", 404);
  res.json({ success: true });
}
