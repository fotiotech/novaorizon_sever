import type { Request, Response } from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import { ValidationError } from "../middleware/error.middleware.js";

/**
 * `memoryStorage` — file lives in RAM, we upload directly to S3.
 * On Vercel, memory is capped (typically 1 GB) and request bodies are
 * capped (4.5 MB Hobby / 10 MB Pro). Larger files need presigned URLs.
 */
export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
}).single("file");

let _s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: env.awsRegion,
      credentials: {
        accessKeyId: env.awsAccessKeyId,
        secretAccessKey: env.awsSecretAccessKey,
      },
    });
  }
  return _s3Client;
}

/**
 * Reduce a user-supplied path fragment to a safe S3 key prefix segment.
 * - splits on / or \,
 * - drops "." and "..",
 * - strips anything outside [A-Za-z0-9_-],
 * - re-joins surviving non-empty segments with "/".
 *
 * `"categories/../../etc"` → `"categories/etc"`
 * `"ABC/../passwd"`        → `"ABC/passwd"`
 * `" products "`           → `"products"`
 */
function sanitizeSegment(input: string | undefined): string {
  if (!input) return "";
  return input
    .split(/[/\\]+/)
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, ""))
    .filter(Boolean)
    .join("/");
}

/** Reduce `originalname` to a safe basename with the extension preserved. */
function sanitizeFilename(name: string | undefined): string {
  if (!name) return "file";
  const base = name.split(/[/\\]/).pop() || "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "file";
}

export async function uploadToS3(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new ValidationError({ file: ["No file provided"] });
  if (!env.awsBucketName || !env.awsRegion) {
    throw new ValidationError({ _form: ["S3 is not configured"] });
  }

  const file = req.file;

  // Both fields are optional; multer places non-file form fields on req.body.
  const instanceId = sanitizeSegment(String(req.body?.instanceId ?? ""));
  const subfolder = sanitizeSegment(String(req.body?.subfolder ?? ""));
  const filename = sanitizeFilename(file.originalname);

  // {instanceId}/{subfolder}/uploads/{uuid}-{filename}
  // Missing segments are dropped entirely.
  const prefix = [instanceId, subfolder].filter(Boolean).join("/");
  const fileKey = `${prefix ? `${prefix}/` : ""}uploads/${uuidv4()}-${filename}`;

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.awsBucketName,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const url = `https://${env.awsBucketName}.s3.${env.awsRegion}.amazonaws.com/${fileKey}`;

    res.status(201).json({ success: true, data: { fileKey, url } });
  } catch (err) {
    console.error("[upload] S3 failed:", err);
    throw new Error("Failed to upload file");
  }
}
