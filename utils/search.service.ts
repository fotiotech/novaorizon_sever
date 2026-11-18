import { Types } from "mongoose";
import Product from "../models/Product.js";
import { connection } from "../config/db.js";
import { getVoyageClient } from "./voyage.js";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./embedding.js";

/**
 * Storefront search — ported from the Next app.
 *
 * Three engines:
 *  - `autocompleteProducts`  → Atlas autocomplete on name/tags
 *  - `searchProducts`        → Atlas compound text search + facets
 *  - `semanticSearch`        → Voyage embeddings + Atlas `$vectorSearch`
 */

const SEARCH_INDEX = "default";
const VECTOR_INDEX = "novaorizon-search";
const TEXT_PATHS = ["name", "description", "shortDescription", "tags"];
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/* -------------------- query-embedding cache (in-process) ----------------- */

const QUERY_CACHE_TTL_MS = 60 * 60 * 1000;
const QUERY_CACHE_MAX = 500;
const queryCache = new Map<string, { vector: number[]; at: number }>();

function getCachedQueryEmbedding(query: string): number[] | null {
  const hit = queryCache.get(query);
  if (!hit) return null;
  if (Date.now() - hit.at > QUERY_CACHE_TTL_MS) {
    queryCache.delete(query);
    return null;
  }
  return hit.vector;
}

function setCachedQueryEmbedding(query: string, vector: number[]): void {
  if (queryCache.size >= QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (oldest) queryCache.delete(oldest);
  }
  queryCache.set(query, { vector, at: Date.now() });
}

export interface SemanticHit {
  _id: string;
  _source: any;
  score: number;
}

export interface SemanticSearchResult {
  hits: SemanticHit[];
  total: { value: number };
}

export interface SemanticSearchFilters {
  categoryId?: string;
  brand?: string;
  priceMin?: number;
  priceMax?: number;
  status?: string;
}

export async function autocompleteProducts(query: string, limit = 8) {
  await connection();

  const q = query?.trim().slice(0, 100) ?? "";
  if (q.length < 2) return [];
  const safeLimit = Math.min(20, Math.max(1, Number(limit) || 8));

  const results = await Product.aggregate([
    {
      $search: {
        index: "default",
        compound: {
          should: [
            {
              autocomplete: {
                query: q,
                path: "name_autocomplete", // ← changed
                score: { boost: { value: 2 } },
              },
            },
            {
              autocomplete: {
                query: q,
                path: "tags_autocomplete", // ← changed
                score: { boost: { value: 1 } },
              },
            },
          ],
          minimumShouldMatch: 1,
        },
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        listPrice: 1,
        mainImage: 1,
        tags: 1,
        score: { $meta: "searchScore" },
      },
    },
    { $limit: safeLimit },
  ]);

  return results;
}

export async function semanticSearch(
  query: string,
  filters: SemanticSearchFilters = {},
  limit = 20,
): Promise<SemanticSearchResult> {
  await connection();

  const q = query?.trim().slice(0, 200) ?? "";
  if (q.length < 2) {
    return { hits: [], total: { value: 0 } };
  }

  const safeLimit = Math.min(20, Math.max(1, Number(limit) || 20));

  if (!process.env.VOYAGE_API_KEY) {
    console.warn("[semanticSearch] VOYAGE_API_KEY missing — returning empty");
    return { hits: [], total: { value: 0 } };
  }

  // ------------------------------------------------------------------
  // 1. Embed the query (cached)
  // ------------------------------------------------------------------
  let queryVector: number[] | null = getCachedQueryEmbedding(q);

  if (!queryVector) {
    try {
      const t0 = Date.now();
      const response: any = await getVoyageClient().embed({
        input: [q],
        model: EMBEDDING_MODEL,
        inputType: "query",
        outputDimension: EMBEDDING_DIMENSIONS,
      });
      queryVector = response.data[0].embedding as number[];

      if (
        Array.isArray(queryVector) &&
        queryVector.length === EMBEDDING_DIMENSIONS
      ) {
        setCachedQueryEmbedding(q, queryVector);
      } else {
        console.warn(
          `[semanticSearch] Unexpected embedding shape: ${queryVector?.length} dims`,
        );
        return { hits: [], total: { value: 0 } };
      }

      console.log(`[semanticSearch] embed "${q}" ${Date.now() - t0}ms (miss)`);
    } catch (err) {
      console.error("[semanticSearch] Failed to embed query:", err);
      return { hits: [], total: { value: 0 } };
    }
  } else {
    console.log(`[semanticSearch] embed "${q}" (hit)`);
  }

  // ------------------------------------------------------------------
  // 2. Build the $vectorSearch pre-filter
  //
  // IMPORTANT: ObjectId-typed filter values must be real BSON ObjectIds
  // (new Types.ObjectId(...)), NOT EJSON {$oid: "..."}. The latter is a
  // string-format that mongosh understands but the Node driver passes
  // through as a plain subdocument, causing every filter to match zero
  // documents silently.
  // ------------------------------------------------------------------
  const filter: Record<string, any> = {};

  if (filters.status) {
    filter.status = { $eq: filters.status };
  }
  if (filters.categoryId && OBJECT_ID_RE.test(filters.categoryId)) {
    filter.categoryId = { $eq: new Types.ObjectId(filters.categoryId) };
  }
  if (filters.brand && OBJECT_ID_RE.test(filters.brand)) {
    filter.brand = { $eq: new Types.ObjectId(filters.brand) };
  }
  if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
    const price: Record<string, number> = {};
    if (filters.priceMin !== undefined) price.$gte = filters.priceMin;
    if (filters.priceMax !== undefined) price.$lte = filters.priceMax;
    filter.price = price;
  }

  // ------------------------------------------------------------------
  // 3. Run $vectorSearch + $lookup for category/brand names
  // ------------------------------------------------------------------
  const vectorStage: any = {
    index: VECTOR_INDEX,
    path: "embedding",
    queryVector,
    numCandidates: Math.max(safeLimit * 10, 100),
    limit: safeLimit,
  };
  if (Object.keys(filter).length > 0) {
    vectorStage.filter = filter;
  }

  const pipeline: any[] = [
    { $vectorSearch: vectorStage },

    // --- resolve category name -------------------------------------
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "_cat",
      },
    },
    { $unwind: { path: "$_cat", preserveNullAndEmptyArrays: true } },

    // --- resolve brand name ----------------------------------------
    {
      $lookup: {
        from: "brands",
        localField: "brand",
        foreignField: "_id",
        as: "_brand",
      },
    },
    { $unwind: { path: "$_brand", preserveNullAndEmptyArrays: true } },

    // --- score -----------------------------------------------------
    { $addFields: { score: { $meta: "vectorSearchScore" } } },

    // --- overwrite denormalized names with live lookups ------------
    // Separate $addFields stage: expressions are forbidden inside an
    // exclusion $project.
    {
      $addFields: {
        categoryName: { $ifNull: ["$_cat.name", "$categoryName"] },
        brandName: { $ifNull: ["$_brand.name", "$brandName"] },
      },
    },

    // --- strip internal / heavy fields -----------------------------
    {
      $project: {
        embedding: 0,
        embeddingText: 0,
        embeddingModel: 0,
        embeddedAt: 0,
        variants: 0,
        reviewsRatings: 0,
        __v: 0,
        createdAt: 0,
        updatedAt: 0,
        _cat: 0,
        _brand: 0,
      },
    },
  ];

  try {
    const rows = await Product.aggregate(pipeline);

    if (Object.keys(filter).length > 0) {
      console.log(
        `[semanticSearch] filter applied — ${rows.length} hits`,
        filter,
      );
    }

    return {
      hits: rows.map((r: any) => ({
        _id: r._id.toString(),
        _source: r,
        score: r.score ?? 0,
      })),
      total: { value: rows.length },
    };
  } catch (err) {
    console.error("[semanticSearch] $vectorSearch failed:", err);
    return { hits: [], total: { value: 0 } };
  }
}

export async function searchProducts(
  query: string,
  filters: any[] = [],
  page = 1,
  size = 20,
) {
  await connection();
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeSize = Math.min(50, Math.max(1, Math.floor(Number(size) || 20)));

  // ----- 1. Build the $search stage -----
  const searchStage: any = { index: SEARCH_INDEX };

  const textClause: any = {};
  if (query && query.trim() !== "") {
    textClause.text = {
      query,
      path: TEXT_PATHS,
      fuzzy: { maxEdits: 2, prefixLength: 1 },
    };
  }

  // ----- 2. Build filter clauses -----
  const filterClauses: any[] = [];

  // ObjectId-typed paths (categoryId, brand) need a real BSON ObjectId,
  // not a hex string. Passing `value.toString()` silently matches nothing.
  const addTerm = (path: string, value: string) => {
    if (!value) return;
    const oid = Types.ObjectId.isValid(value)
      ? new Types.ObjectId(value)
      : null;
    filterClauses.push({ equals: { path, value: oid ?? value } });
  };

  for (const f of filters) {
    // --- term: { categoryId: "…" } | { brand: "…" } | { status: "active" }
    if (f.term) {
      const [path, value] = Object.entries(f.term)[0];
      addTerm(path, value as string);
    }

    // --- range: { price: { gte, lte } }
    if (f.range) {
      const [path, range]: any = Object.entries(f.range)[0];
      const rangeClause: any = {};
      if (range.gte !== undefined) rangeClause.gte = range.gte;
      if (range.lte !== undefined) rangeClause.lte = range.lte;
      if (Object.keys(rangeClause).length) {
        filterClauses.push({ range: { path, ...rangeClause } });
      }
    }

    // --- attribute: { key: "color", value: "black" }
    //
    // Attributes are stored FLAT on the Product root, one key per
    // category attribute code (`product.color`, `product.weight`, …).
    // The Atlas index has `dynamic: true`, so each dynamic string is
    // indexed with the standard analyzer (lowercased, tokenized) and
    // each dynamic number is indexed as a number. `equals` on a string
    // field matches either the scalar value or any element of an array,
    // which is why `color: "black"` and `color: ["black","white"]` both
    // resolve with a single `equals` clause.
    if (f.attribute) {
      const { key, value } = f.attribute;
      if (!key || value == null || value === "") continue;

      const path = String(key);
      const raw = String(value).trim().toLowerCase();

      // Numeric-looking strings ("45", "3.5") are sent as numbers so
      // they match number-typed dynamic fields. Everything else stays
      // a string. String("45") === "45" — that check rejects "45abc",
      // "045", " 45 ", "4e2" etc. where Number() would silently coerce.
      const asNumber = Number(raw);
      const numericValue =
        raw !== "" && Number.isFinite(asNumber) && String(asNumber) === raw
          ? asNumber
          : null;

      filterClauses.push({
        equals: { path, value: numericValue ?? raw },
      });
    }
  }

  // ----- 3. Compose compound -----
  const must: any[] = [];
  if (textClause.text) must.push(textClause);

  const filter = filterClauses.length > 0 ? filterClauses : undefined;

  if (must.length === 0 && !filter) {
    return {
      hits: [],
      total: { value: 0 },
      aggregations: {
        categories: [],
        brands: [],
        priceRange: { min: 0, max: 0 },
      },
    };
  }

  const compound: any = {};
  // When there's no text query, we still need a must clause for the
  // filters to attach to. `exists: name` is a cheap match-all.
  compound.must = must.length > 0 ? must : [{ exists: { path: "name" } }];
  if (filter) compound.filter = filter;

  searchStage.compound = compound;

  // ----- 4. Pipeline with $facet -----
  const pipeline: any[] = [
    { $search: searchStage },
    {
      $facet: {
        hits: [
          { $addFields: { score: { $meta: "searchScore" } } },
          { $skip: (safePage - 1) * safeSize },
          { $limit: safeSize },
          {
            $project: {
              variants: 0,
              reviewsRatings: 0,
              __v: 0,
              createdAt: 0,
              updatedAt: 0,
            },
          },
        ],
        categories: [
          {
            $unwind: { path: "$categoryId", preserveNullAndEmptyArrays: true },
          },
          { $group: { _id: "$categoryId", count: { $sum: 1 } } },
          {
            $lookup: {
              from: "categories",
              localField: "_id",
              foreignField: "_id",
              as: "categoryInfo",
            },
          },
          {
            $unwind: {
              path: "$categoryInfo",
              preserveNullAndEmptyArrays: true,
            },
          },
          { $project: { _id: 1, name: "$categoryInfo.name", count: 1 } },
          { $sort: { count: -1 } },
        ],
        brands: [
          { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
          { $group: { _id: "$brand", count: { $sum: 1 } } },
          {
            $lookup: {
              from: "brands",
              localField: "_id",
              foreignField: "_id",
              as: "brandInfo",
            },
          },
          { $unwind: { path: "$brandInfo", preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, name: "$brandInfo.name", count: 1 } },
          { $sort: { count: -1 } },
        ],
        // Uses `price`, matching the range filter in `buildFilters`.
        priceRange: [
          {
            $group: {
              _id: null,
              min: { $min: "$price" },
              max: { $max: "$price" },
            },
          },
        ],
        totalCount: [{ $count: "total" }],
      },
    },
  ];

  const [result] = await Product.aggregate(pipeline);

  const hits = result.hits || [];
  const categories = result.categories || [];
  const brands = result.brands || [];
  const priceRange = result.priceRange?.[0] || { min: 0, max: 0 };
  const total = result.totalCount?.[0]?.total || 0;

  return {
    hits: hits.map((hit: any) => ({
      _id: hit._id.toString(),
      _source: hit,
    })),
    total: { value: total },
    aggregations: {
      categories,
      brands,
      priceRange,
    },
  };
}
