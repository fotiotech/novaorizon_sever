import type { Request, Response } from "express";
import mongoose from "mongoose";
import Tile from "../models/Tile.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { revalidateClientTags } from "../utils/revalidate-client.js";
import { toPlain } from "../utils/toPlain.js";

const STATUSES = ["active", "inactive"] as const;
type TileStatus = (typeof STATUSES)[number];

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function readInput(body: any): {
  title: string;
  imageUrl: string | null;
  link: string | null;
  backgroundColor: string | null;
  backgroundImage: string | null;
  status: TileStatus;
  order: number;
} {
  const title = String(body?.title ?? "").trim();
  if (!title) throw new ValidationError({ title: ["Title is required"] });

  const status = String(body?.status ?? "active");
  if (!(STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError({ status: ["Invalid status"] });
  }

  return {
    title,
    imageUrl: String(body?.imageUrl ?? "").trim() || null,
    link: String(body?.link ?? "").trim() || null,
    backgroundColor: String(body?.backgroundColor ?? "").trim() || null,
    backgroundImage: String(body?.backgroundImage ?? "").trim() || null,
    status: status as TileStatus,
    order: Math.max(0, Number(body?.order) || 0),
  };
}

function revalidate(): void {
  void revalidateClientTags(["tiles"]);
}

/* --------------------------------- reads --------------------------------- */

export async function listTiles(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const tiles = await Tile.find({ status: "active" })
    .sort({ order: 1, created_at: 1 })
    .lean();
  res.json({ data: toPlain(tiles) });
}

export async function listAllTiles(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const tiles = await Tile.find({})
    .sort({ order: 1, created_at: 1 })
    .lean();
  res.json({ data: toPlain(tiles) });
}

export async function getTile(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid tile ID"] });
  }
  await connection();
  const tile = await Tile.findById(id).lean();
  if (!tile) throw new AppError("Tile not found", 404);
  res.json({ data: toPlain(tile) });
}

/* ------------------------------- mutations ------------------------------- */

export async function createTile(req: Request, res: Response): Promise<void> {
  await connection();
  const tile = await Tile.create(readInput(req.body ?? {}));
  revalidate();
  res.status(201).json({ data: toPlain(tile.toObject()) });
}

export async function updateTile(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid tile ID"] });
  }
  await connection();
  const tile = await Tile.findByIdAndUpdate(id, { $set: readInput(req.body ?? {}) }, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!tile) throw new AppError("Tile not found", 404);
  revalidate();
  res.json({ data: toPlain(tile.toObject()) });
}

export async function deleteTile(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid tile ID"] });
  }
  await connection();
  const tile = await Tile.findByIdAndDelete(id);
  if (!tile) throw new AppError("Tile not found", 404);
  revalidate();
  res.json({ success: true });
}

export async function reorderTiles(req: Request, res: Response): Promise<void> {
  await connection();
  const orderedIds = req.body?.orderedIds;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new ValidationError({ orderedIds: ["No ids provided"] });
  }
  if (
    !orderedIds.every(
      (id: any) =>
        typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
    )
  ) {
    throw new ValidationError({ orderedIds: ["Invalid ids"] });
  }

  await Tile.bulkWrite(
    orderedIds.map((id: string, index: number) => ({
      updateOne: { filter: { _id: id }, update: { order: index } },
    })),
  );
  revalidate();
  res.json({ success: true });
}