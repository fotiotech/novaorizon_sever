/**
 * Makes the S3 bucket's objects publicly readable so image URLs work directly
 * (and the Next.js image optimizer can fetch them).
 *
 *   npx tsx scripts/fix-s3-public-read.ts          # dry run (prints policy)
 *   npx tsx scripts/fix-s3-public-read.ts --apply  # applies it
 *
 * Requires AWS_BUCKET_NAME / AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 * with s3:PutBucketPolicy and s3:PutPublicAccessBlock permissions.
 *
 * WARNING: this makes every object in the bucket readable by anyone with the
 * URL. Only use it for a bucket that exclusively hosts public storefront assets.
 */
import {
  S3Client,
  PutBucketPolicyCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

async function main() {
  const apply = process.argv.includes("--apply");
  const bucket = env.awsBucketName;
  const region = env.awsRegion;

  if (!bucket || !region) {
    throw new Error("AWS_BUCKET_NAME and AWS_REGION must be set.");
  }
  if (!env.awsAccessKeyId || !env.awsSecretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY must be set.");
  }

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadProductImages",
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };

  console.log("Bucket:", bucket, "Region:", region);
  console.log("Policy:", JSON.stringify(policy, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to update the bucket.");
    return;
  }

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
    },
  });

  await client.send(
    new PutPublicAccessBlockCommand({
      Bucket: bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    }),
  );
  console.log("Public access block updated (public bucket policy allowed).");

  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy),
    }),
  );
  console.log("Bucket policy applied: objects are publicly readable.");
  console.log(
    "Verify with: curl -I https://" +
      bucket +
      ".s3." +
      region +
      ".amazonaws.com/<key>",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
