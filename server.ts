import app from "./app.js";
import { env } from "./config/env.js";

/**
 * Production entrypoint.
 *
 * `app.ts` only builds the Express application; `dev.ts` runs it through
 * `tsx watch`. This module is what `node dist/server.js` starts, and it is also
 * what a plain Node host (Railway, Render, Docker, a VM) should run.
 */
const port = env.port;

const server = app.listen(port, () => {
  console.log(`[${env.nodeEnv}] listening on :${port}${env.apiPrefix}`);
});

// Graceful shutdown so deploys/restarts don't drop in-flight requests.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[${env.nodeEnv}] ${signal} received, closing server`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
