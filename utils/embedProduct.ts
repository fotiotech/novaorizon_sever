import { VoyageAIClient } from "voyageai";
import { env } from "../config/env.js";
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  buildEmbeddingText,
  type EmbeddableProduct,
} from "./embedding.js";

let _client: VoyageAIClient | null = null;

function getClient(): VoyageAIClient {
  if (!_client) {
    _client = new VoyageAIClient({
      apiKey: env.voyageApiKey,
      baseUrl: env.voyageBaseUrl,
    });
  }
  return _client;
}

export interface EmbeddingResult {
  embedding: number[];
  embeddingText: string;
  embeddingModel: string;
  embeddedAt: Date;
}

export async function embedProduct(
  product: EmbeddableProduct,
): Promise<EmbeddingResult | null> {
  if (!env.voyageApiKey) {
    console.warn("[embedProduct] VOYAGE_API_KEY not set — skipping embedding");
    return null;
  }

  const text = buildEmbeddingText(product);
  if (!text) return null;

  try {
    const response = await getClient().embed({
      input: [text],
      model: EMBEDDING_MODEL,
      inputType: "document",
      outputDimension: EMBEDDING_DIMENSIONS,
    });

    const embedding = response.data?.[0]?.embedding;
    if (
      !Array.isArray(embedding) ||
      embedding.length !== EMBEDDING_DIMENSIONS
    ) {
      console.error(
        `[embedProduct] Unexpected embedding shape: got ${embedding?.length} dims`,
      );
      return null;
    }

    return {
      embedding,
      embeddingText: text,
      embeddingModel: EMBEDDING_MODEL,
      embeddedAt: new Date(),
    };
  } catch (err) {
    console.error("[embedProduct] Voyage API error:", err);
    return null;
  }
}
