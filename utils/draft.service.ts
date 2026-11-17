import Draft from "../models/Draft.js";
import CategoryPropertyDraft from "../models/CategoryPropertyDraft.js";
import { connection } from "../config/db.js";

function toSerializable<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    console.warn("[drafts] JSON round-trip failed; dropping payload", err);
    return {} as T;
  }
}

/* ---------------------------- Product drafts ---------------------------- */

export async function saveProductDraftForUser(
  userId: string,
  productId: string,
  data: any,
): Promise<void> {
  await connection();
  const safeData = toSerializable(data);
  await Draft.findOneAndUpdate(
    { userId, productId },
    { data: safeData, updatedAt: new Date() },
    { upsert: true, new: true },
  );
}

export async function getProductDraftForUser(
  userId: string,
  productId: string,
): Promise<{ data: any; updatedAt: Date } | null> {
  await connection();
  const draft = await Draft.findOne({ userId, productId }).lean();
  if (!draft) return null;
  return { data: (draft as any).data, updatedAt: (draft as any).updatedAt };
}

export async function deleteProductDraftForUser(
  userId: string,
  productId: string,
): Promise<void> {
  await connection();
  await Draft.deleteOne({ userId, productId });
}

/* --------------------- Category property drafts ------------------------- */

export interface CategoryPropertyDraftPayload<T = any> {
  version: number;
  savedAt: number;
  data: T;
}

export async function getCategoryPropertyDraftForUser(
  userId: string | null,
  key: string,
): Promise<CategoryPropertyDraftPayload | null> {
  await connection();
  const draft = await CategoryPropertyDraft.findOne({
    key,
    userId: userId ?? null,
  }).lean();
  if (!draft) return null;
  return {
    version: draft.version,
    savedAt: new Date(draft.savedAt).getTime(),
    data: draft.data,
  };
}

export async function saveCategoryPropertyDraftForUser(
  userId: string | null,
  key: string,
  version: number,
  data: any,
): Promise<{ savedAt: number }> {
  await connection();
  const savedAt = new Date();
  await CategoryPropertyDraft.findOneAndUpdate(
    { key, userId: userId ?? null },
    { $set: { version, data, savedAt } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  return { savedAt: savedAt.getTime() };
}

export async function deleteCategoryPropertyDraftForUser(
  userId: string | null,
  key: string,
): Promise<void> {
  await connection();
  await CategoryPropertyDraft.deleteOne({ key, userId: userId ?? null });
}
