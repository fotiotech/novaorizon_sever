import Collection from "../models/Collection.js";
import { resolveCollection } from "./content-resolve.js";

const TTL_MS = 30_000;
const cache = new Map<string, { ids: Set<string>; expires: number }>();

async function collectionProductIds(collectionId: string): Promise<Set<string>> {
  const hit = cache.get(collectionId);
  if (hit && hit.expires > Date.now()) return hit.ids;

  const collection: any = await Collection.findById(collectionId).lean();
  const ids = new Set<string>();
  if (collection) {
    const items = await resolveCollection(collectionId, {}, 2000);
    for (const item of items) {
      if (item?.contentType === "Product") ids.add(String(item._id));
    }
  }

  cache.set(collectionId, { ids, expires: Date.now() + TTL_MS });
  return ids;
}

/**
 * Attaches `_collectionProductIds` to offers that target collections so the
 * synchronous eligibility matcher can check membership.
 */
export async function attachOfferCollectionMembership(
  offers: any[],
): Promise<any[]> {
  if (!Array.isArray(offers) || offers.length === 0) return offers;

  const collectionIds = [
    ...new Set(
      offers.flatMap((offer) =>
        (offer?.eligibility?.collectionIds ?? []).map(String),
      ),
    ),
  ];

  if (collectionIds.length === 0) return offers;

  const sets = new Map<string, Set<string>>();
  await Promise.all(
    collectionIds.map(async (id) => {
      sets.set(id, await collectionProductIds(id));
    }),
  );

  for (const offer of offers) {
    const ids = new Set<string>();
    for (const collectionId of offer.eligibility?.collectionIds ?? []) {
      for (const productId of sets.get(String(collectionId)) ?? []) {
        ids.add(productId);
      }
    }
    offer._collectionProductIds = ids;
  }

  return offers;
}
