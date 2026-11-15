// config/db.ts
import mongoose from "mongoose";
import { env } from "./env.js";

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connection(): Promise<void> {
  mongoose.set("strictQuery", true);
  if (mongoose.connection.readyState === 1) return;

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(env.mongodbUri, {
        dbName: env.mongodbDbName,
        // --- SERVERLESS OPTIMIZATIONS ---
        maxPoolSize: 5, // Keep the pool small (1-10 is recommended)[reference:7]
        minPoolSize: 0, // Don't keep idle connections alive[reference:8]
        maxIdleTimeMS: 10000, // Close idle connections quickly[reference:9]
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })
      .catch((error) => {
        connectionPromise = null;
        console.error("[MongoDB] connection failed");
        throw error;
      });
  }
  await connectionPromise;
}
