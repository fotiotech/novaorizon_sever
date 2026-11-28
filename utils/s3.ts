import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

let _s3Client: S3Client | null = null;

export function resetS3Client(): void {
  _s3Client = null;
}

/**
 * Static keys are optional. When absent, the SDK uses its default provider
 * chain (ECS task role, EC2 instance profile, environment, etc.).
 */
export function s3Credentials() {
  if (env.awsAccessKeyId && env.awsSecretAccessKey) {
    return {
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
    };
  }
  return undefined;
}

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: env.awsRegion,
      credentials: s3Credentials(),
    });
  }
  return _s3Client;
}

/**
 * Delete an object from S3. Accepts either a raw S3 key (`uploads/abc.jpg`)
 * or a full URL. When a URL is passed we derive the key from its pathname.
 *
 * Silently no-ops if AWS env is not configured — keeps the developer
 * experience sane in a fresh clone where only the DB is set up.
 */
export async function deleteS3Object(urlOrKey: string): Promise<void> {
  if (!urlOrKey) return;
  if (!env.awsRegion || !env.awsBucketName) {
    console.warn(`[s3] AWS not configured — skipping delete for ${urlOrKey}`);
    return;
  }

  let key = urlOrKey;
  if (key.startsWith("http")) {
    try {
      key = new URL(key).pathname.replace(/^\//, "");
    } catch {
      return;
    }
  }

  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: env.awsBucketName,
        Key: key,
      }),
    );
  } catch (err) {
    console.error("[s3] delete failed:", key, err);
    throw err;
  }
}