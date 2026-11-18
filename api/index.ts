import app from "../app.js";

/**
 * Vercel serverless entrypoint.
 *
 * Everything under `/api/*` is rewritten here by `vercel.json`; the Express
 * app handles routing internally (it already mounts its router at `/api`).
 */
export default app;
