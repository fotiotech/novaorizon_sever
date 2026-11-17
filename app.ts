import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error.middleware.js";
import cookieParser from "cookie-parser";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(cookieParser(env.cookieSecret));

  const allowedOrigins =
    env.corsOrigin === "*"
      ? true
      : env.corsOrigin.split(",").map((s) => s.trim());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (_req, res) => {
    res.send(`API running. Try ${env.apiPrefix}/health`);
  });

  app.use(env.apiPrefix, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
