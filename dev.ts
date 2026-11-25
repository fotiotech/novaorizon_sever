import { loadSecretsIntoEnv } from "./config/secrets.js";

// Secrets must be merged before app/env modules read process.env.
await loadSecretsIntoEnv();

const { default: app } = await import("./app.js");
const { env } = await import("./config/env.js");

app.listen(env.port, () => {
  console.log(`[${env.nodeEnv}] http://localhost:${env.port}${env.apiPrefix}`);
});