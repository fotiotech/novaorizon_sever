import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connection } from "./config/db.js";

async function main(): Promise<void> {
  try {
    await connection();
    console.log("[MongoDB] connected");
  } catch {
    console.warn(
      "[MongoDB] initial connection failed — DB routes will error until it recovers",
    );
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(
      `[${env.nodeEnv}] Server listening on http://localhost:${env.port}${env.apiPrefix}`,
    );
  });

  const shutdown = (signal: string): void => {
    console.log(`\n${signal} received, closing server...`);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
