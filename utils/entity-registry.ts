import type { Model } from "mongoose";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";
import Promotion from "../models/Promotion.js";
import Page from "../models/Page.js";
import { Collection } from "../models/Collection.js";
import {
  ENTITY_METADATA,
  getEntityMetadata,
  getAttributesFor,
  type AttributeConfig,
  type EntityMetadata,
  type RegistryKey,
} from "../config/entity-metadata.js";

export interface EntityConfig<T = any> extends EntityMetadata {
  model: Model<T>;
  href: (doc: T) => string;
  image: (doc: T) => string | undefined;
}

export const ENTITY_REGISTRY: Record<RegistryKey, EntityConfig> = {
  Product: {
    ...ENTITY_METADATA.Product,
    model: Product as any,
    href: (p: any) => `/products/${p.slug ?? p._id}`,
    image: (p: any) =>
      Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : undefined,
  },
  Category: {
    ...ENTITY_METADATA.Category,
    model: Category as any,
    href: (c: any) => `/categories/${c.slug ?? c._id}`,
    image: (c: any) =>
      Array.isArray(c.imageUrl) && c.imageUrl.length > 0
        ? c.imageUrl[0]
        : undefined,
  },
  Brand: {
    ...ENTITY_METADATA.Brand,
    model: Brand as any,
    href: (b: any) => `/brands/${b.url_slug ?? b._id}`,
    image: (b: any) => b.logoUrl,
  },
  Promotion: {
    ...ENTITY_METADATA.Promotion,
    model: Promotion as any,
    href: (p: any) => `/promotions/${p.code ?? p._id}`,
    image: () => undefined,
  },
  Collection: {
    ...ENTITY_METADATA.Collection,
    model: Collection as any,
    href: (c: any) => `/catalog/collections/${c._id}`,
    image: (c: any) => c.imageUrl,
  },
  Page: {
    ...ENTITY_METADATA.Page,
    model: Page as any,
    href: (p: any) => p.url ?? `/pages/${p.slug ?? p._id}`,
    // BUG FIXED: original checked `images` and `image` — neither exists on
    // Page. Real field is `featuredImage`.
    image: (p: any) => p.featuredImage ?? undefined,
  },
};

export function getEntityConfig(key: string): EntityConfig | null {
  return (ENTITY_REGISTRY as Record<string, EntityConfig>)[key] ?? null;
}

export { ENTITY_METADATA, getEntityMetadata, getAttributesFor };
export type { AttributeConfig, EntityMetadata, RegistryKey };
