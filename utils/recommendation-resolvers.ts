import type { RegistryKey } from "../config/entity-metadata.js";

// TODO: replace with real implementations from `app/actions/events`.
async function getRecommendations(_limit: number): Promise<any[]> {
  return [];
}
async function getRecentlyViewed(_limit: number): Promise<any[]> {
  return [];
}

export interface RecommendationContext {
  userId?: string;
}

export type RecommendationResolver = (
  kind: string,
  limit: number,
  ctx?: RecommendationContext,
) => Promise<any[]>;

export const RECOMMENDATION_RESOLVERS: Partial<
  Record<RegistryKey, RecommendationResolver>
> = {
  Product: async (kind, limit, ctx) => {
    switch (kind) {
      case "personalized":
        return ctx?.userId ? getRecommendations(limit) : [];
      case "recentlyViewed":
        return ctx?.userId ? getRecentlyViewed(limit) : [];
      default:
        return [];
    }
  },
};

export function getRecommendationResolver(
  targetType: string | null | undefined,
): RecommendationResolver | undefined {
  if (!targetType) return undefined;
  return RECOMMENDATION_RESOLVERS[targetType as RegistryKey];
}
