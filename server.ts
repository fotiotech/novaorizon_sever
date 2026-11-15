import { createApp } from "./app.js";

/**
 * Vercel (and every serverless platform) imports this module and
 * invokes the *default export* as the request handler. Do NOT call
 * `app.listen()` — Vercel manages the HTTP server itself.
 *
 * Startup tasks that belonged in a long-lived process:
 *   - eager DB connect → removed. Every controller calls connection()
 *     lazily on the first request that needs the DB.
 *   - SIGINT/SIGTERM handlers → removed. No long-lived process to clean up.
 */
const app = createApp();

export default app;
