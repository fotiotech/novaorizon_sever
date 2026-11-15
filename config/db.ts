import mongoose from "mongoose";
import { env } from "./env.js";

let connectionPromise: Promise<typeof mongoose> | null = null;

// If Mongo drops the connection (idle timeout, network blip),
// clear the cached promise so the next request reconnects.
mongoose.connection.on("disconnected", () => {
  connectionPromise = null;
});

export async function connection(): Promise<void> {
  mongoose.set("strictQuery", true);
  if (mongoose.connection.readyState === 1) return;

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(env.mongodbUri, {
        dbName: env.mongodbDbName,
        // Serverless-appropriate pool — one warm instance ≠ one app server
        maxPoolSize: 5,
        minPoolSize: 0,
        maxIdleTimeMS: 10_000,
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 45_000,
      })
      .then((m) => m)
      .catch((error) => {
        connectionPromise = null;
        console.error("[MongoDB] connection failed:", (error as Error).message);
        throw error;
      });
  }

  await connectionPromise;
}
