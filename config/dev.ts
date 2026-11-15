// dev.ts
import { createApp } from "../app.js";
import { env } from "./env.js";

createApp().listen(env.port, () => {
  console.log(`[${env.nodeEnv}] http://localhost:${env.port}${env.apiPrefix}`);
});
