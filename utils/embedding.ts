export const EMBEDDING_MODEL = "voyage-4-lite";
export const EMBEDDING_DIMENSIONS = 1024;

export interface EmbeddableProduct {
  name?: string;
  categoryName?: string;
  brandName?: string;
  shortDescription?: string;
  description?: string;
  tags?: string[];
}

export function buildEmbeddingText(p: EmbeddableProduct): string {
  const parts: string[] = [];
  if (p.name) parts.push(p.name);
  if (p.categoryName) parts.push(`Category: ${p.categoryName}`);
  if (p.brandName) parts.push(`Brand: ${p.brandName}`);
  if (p.tags?.length) parts.push(`Tags: ${p.tags.join(", ")}`);
  if (p.shortDescription) parts.push(p.shortDescription);
  if (p.description) parts.push(p.description);

  const text = parts.join("\n").trim();
  return text.length > 4000 ? text.slice(0, 4000) : text;
}

export function needsReembedding(
  product: EmbeddableProduct & {
    embedding?: number[];
    embeddingText?: string;
  },
): boolean {
  if (!Array.isArray(product.embedding) || product.embedding.length === 0)
    return true;
  return buildEmbeddingText(product) !== (product.embeddingText ?? "");
}
