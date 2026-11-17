import type { Request, Response } from "express";
import Product from "../models/Product.js";
import "../models/Brand.js";
import "../models/Category.js";
import { connection } from "../config/db.js";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getSearch(req: Request, res: Response): Promise<void> {
  const query = String(req.query.q ?? req.query.query ?? "").trim();
  const category = req.query.category as string | undefined;
  const brand = req.query.brand as string | undefined;
  const priceMin = req.query.priceMin as string | undefined;
  const priceMax = req.query.priceMax as string | undefined;

  if (!query) {
    res.json({ data: { products: [], filters: {} } });
    return;
  }

  await connection();

  const safeQuery = escapeRegex(query);

  const [filters, products] = await Promise.all([
    generateFilters(safeQuery),
    Product.find({
      name: { $regex: safeQuery, $options: "i" },
      ...(category && { categoryId: category }),
      ...(brand && { brand: brand }),
      ...(priceMin &&
        priceMax && { price: { $gte: +priceMin, $lte: +priceMax } }),
    }).lean(),
  ]);

  res.json({
    data: {
      products: products.map((p: any) => ({
        ...p,
        _id: p._id.toString(),
        category_id: p.categoryId?.toString(),
        brand_id: p.brand?.toString(),
      })),
      filters,
    },
  });
}

async function generateFilters(safeQuery: string) {
  try {
    const agg = await Product.aggregate([
      { $match: { name: { $regex: safeQuery, $options: "i" } } },
      {
        $facet: {
          categories: [
            { $group: { _id: "$categoryId", count: { $sum: 1 } } },
            {
              $lookup: {
                from: "categories",
                localField: "_id",
                foreignField: "_id",
                as: "details",
              },
            },
            { $unwind: "$details" },
            { $project: { id: "$_id", name: "$details.name", count: 1 } },
          ],
          brands: [
            { $group: { _id: "$brand", count: { $sum: 1 } } },
            {
              $lookup: {
                from: "brands",
                localField: "_id",
                foreignField: "_id",
                as: "details",
              },
            },
            { $unwind: "$details" },
            { $project: { id: "$_id", name: "$details.name", count: 1 } },
          ],
          priceRange: [
            {
              $group: {
                _id: null,
                minPrice: { $min: "$price" },
                maxPrice: { $max: "$price" },
              },
            },
          ],
        },
      },
    ]);

    const f = agg[0];

    return {
      categories: (f.categories ?? []).map((c: any) => ({
        id: c._id?.toString(),
        name: c.name,
        count: c.count,
      })),
      brands: (f.brands ?? []).map((b: any) => ({
        id: b._id?.toString(),
        name: b.name,
        count: b.count,
      })),
      priceRange: {
        min: f.priceRange?.[0]?.minPrice ?? 0,
        max: f.priceRange?.[0]?.maxPrice ?? 0,
      },
    };
  } catch (err) {
    console.error("[search filters]", err);
    return { categories: [], brands: [], priceRange: { min: 0, max: 0 } };
  }
}
