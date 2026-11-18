import { VoyageAIClient } from "voyageai";
import { env } from "../config/env.js";

/**
 * MongoDB Atlas hosts Voyage models behind its own endpoint; the SDK default
 * (api.voyageai.com) rejects Atlas-issued keys.
 */
let _client: VoyageAIClient | null = null;

export function getVoyageClient(): VoyageAIClient {
  if (!_client) {
    _client = new VoyageAIClient({
      apiKey: env.voyageApiKey || process.env.VOYAGE_API_KEY || "",
      baseUrl: env.voyageBaseUrl,
    });
  }
  return _client;
}
