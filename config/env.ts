import "dotenv/config";

/**
 * Reads a required env var. Throws at startup if the var is missing and
 * no fallback is provided. Use for anything the app can't run without:
 * database URI, JWT secret, etc.
 */
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Reads an optional env var. Returns the fallback (defaults to `""`)
 * when unset. Use for optional integrations — the calling code is
 * responsible for treating `""` as "not configured".
 */
function read(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function buildEnv() {
  return {
  /* ------------------------------ Server ------------------------------ */
  nodeEnv: required("NODE_ENV", "development"),
  port: Number(required("PORT", "3000")),
  apiPrefix: required("API_PREFIX", "/api"),
  corsOrigin: required("CORS_ORIGIN", "*"),
  /** Secret used to sign the cookie (separate from JWT_SECRET). */
  cookieSecret: required("COOKIE_SECRET"),
  /** JWT lifetime — "30d" by default so the cookie can be httpOnly+persistent. */
  jwtExpiresIn: read("JWT_EXPIRES_IN", "30d"),
  /**
   * Domain to set on the cookie. Leave empty for localhost (browsers treat
   * `localhost` + `localhost:3001` as same-site). In production set to
   * your registrable domain — e.g. `.novaorizon.com` — so both
   * `app.novaorizon.com` and `api.novaorizon.com` receive it.
   */
  cookieDomain: read("COOKIE_DOMAIN"),

  /** Public frontend origin — used in emails, reset links, Meta catalog URLs. */
  frontendUrl: required("FRONTEND_URL", "http://localhost:3000"),
  /** Shared secret for the storefront's on-demand revalidation endpoint. */
  revalidateSecret: read("REVALIDATE_SECRET"),

  /* ----------------------------- Database ----------------------------- */
  mongodbUri: required("MONGODB_URI"),
  mongodbDbName: required("MONGODB_DB_NAME", "fotiodb"),

  /* ------------------------------- Auth ------------------------------- */
  jwtSecret: required("JWT_SECRET"),

  /* -------------------------- Voyage (embeddings) --------------------- */
  // Empty string = embeddings disabled. `utils/embedProduct.ts` warns and
  // returns null in that case, so products save without an embedding.
  voyageApiKey: read("VOYAGE_API_KEY"),
  voyageBaseUrl: read("VOYAGE_BASE_URL", "https://ai.mongodb.com/v1"),

  /* --------------------------- Pusher (realtime) ---------------------- */
  // Empty = realtime pushes silently no-op. `utils/pusher.ts` returns null.
  pusherAppId: read("PUSHER_APP_ID"),
  pusherKey: read("PUSHER_KEY") || read("NEXT_PUBLIC_PUSHER_APP_KEY"),
  pusherSecret: read("PUSHER_SECRET"),
  pusherCluster:
    read("PUSHER_CLUSTER") || read("NEXT_PUBLIC_PUSHER_APP_CLUSTER"),

  /* ----------------------- AWS S3 (uploads/images) -------------------- */
  // Empty = `deleteS3Object()` logs and no-ops. Uploads return 400.
  awsRegion: read("AWS_REGION"),
  awsAccessKeyId: read("AWS_ACCESS_KEY_ID"),
  awsSecretAccessKey: read("AWS_SECRET_ACCESS_KEY"),
  awsBucketName: read("AWS_BUCKET_NAME"),
  /** Optional CDN/public base URL (e.g. CloudFront) used for returned image URLs. */
  awsPublicBaseUrl: read("AWS_PUBLIC_BASE_URL"),
  /** Optional canned ACL for uploads (e.g. "public-read"); omit for bucket-policy setups. */
  awsObjectAcl: read("AWS_OBJECT_ACL"),

  /* --------------------------- Resend (email) ------------------------- */
  // Empty = forgot-password silently no-ops (safe) and campaigns fail
  // per-recipient with a ProviderError.
  resendApiKey: read("RESEND_API_KEY"),
  } as const;
}

export const env = buildEnv();

/** Recompute the cached config after a secrets update. */
export function refreshEnv(): void {
  Object.assign(env, buildEnv());
}

export const isProd = env.nodeEnv === "production";
export const isDev = !isProd;