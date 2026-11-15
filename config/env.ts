import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  nodeEnv: required("NODE_ENV", "development"),
  port: Number(required("PORT", "3000")),
  apiPrefix: required("API_PREFIX", "/api"),
  corsOrigin: required("CORS_ORIGIN", "*"),
  mongodbUri: required("MONGODB_URI"),
  mongodbDbName: required("MONGODB_DB_NAME", "fotiodb"),
  jwtSecret: required("JWT_SECRET"),
} as const;

export const isProd = env.nodeEnv === "production";
export const isDev = !isProd;
