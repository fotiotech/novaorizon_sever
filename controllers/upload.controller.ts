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

export async function uploadToS3(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new ValidationError({ file: ["No file provided"] });
  if (!env.awsBucketName || !env.awsRegion) {
    throw new ValidationError({ _form: ["S3 is not configured"] });
  }

  const file = req.file;
  const fileKey = `uploads/${uuidv4()}-${file.originalname}`;

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.awsBucketName,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    // Build a public URL. If the bucket isn't public, this URL will 403 —
    // adjust per your CloudFront / bucket-policy setup.
    const url = `https://${env.awsBucketName}.s3.${env.awsRegion}.amazonaws.com/${fileKey}`;

    res.status(201).json({ success: true, data: { fileKey, url } });
  } catch (err) {
    console.error("[upload] S3 failed:", err);
    throw new Error("Failed to upload file");
  }
}
