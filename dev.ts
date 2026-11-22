import app from "./app.js";
import { env } from "./config/env.js";

app.listen(env.port, () => {
  console.log(`[${env.nodeEnv}] http://localhost:${env.port}${env.apiPrefix}`);
});