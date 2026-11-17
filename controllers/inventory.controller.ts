import type { Request, Response } from "express";
import Product from "../models/Product.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

export async function getInventory(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const inventoryData = await Product.find(
    {},
    {
      _id: 1,
      name: 1,
      sku: 1,
      quantity: 1,
      lowStockThreshold: 1,
      status: 1,
      updatedAt: 1,
    },
  ).lean();

  res.json({
    data: inventoryData.map((item: any) => ({
      product_id: item._id.toString(),
      productName: item.name,
      sku: item.sku,
      stockQuantity: item.quantity || 0,
      lowStockThreshold: item.lowStockThreshold || 10,
      stockStatus:
        item.quantity <= 0
          ? "out_of_stock"
          : item.quantity <= (item.lowStockThreshold ?? 10)
            ? "low_stock"
            : "in_stock",
      lastUpdated: item.updatedAt || new Date(),
    })),
  });
}

export async function updateInventory(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const productId = Array.isArray(req.params.productId)
    ? req.params.productId[0]
    : req.params.productId;
  const { quantity, lowStockThreshold } = req.body ?? {};

  const product = await Product.findById(productId);
  if (!product) throw new AppError("Product not found", 404);

  const nextQuantity = Number(quantity);
  if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
    throw new ValidationError({ quantity: ["Must be a non-negative number"] });
  }
  const nextThreshold =
    lowStockThreshold !== undefined
      ? Number(lowStockThreshold)
      : Number(product.lowStockThreshold ?? 10);

  product.quantity = nextQuantity;
  product.lowStockThreshold = nextThreshold;
  await product.save();

  res.json({
    data: {
      message: "Success",
      stockStatus:
        nextQuantity <= 0
          ? "out_of_stock"
          : nextQuantity <= nextThreshold
            ? "low_stock"
            : "in_stock",
      lastUpdated: product.updatedAt,
    },
  });
}

export async function getInventoryStats(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const stats = await Product.aggregate([
    {
      $group: {
        _id: {
          $cond: [
            { $lte: ["$quantity", 0] },
            "out_of_stock",
            {
              $cond: [
                { $lte: ["$quantity", "$lowStockThreshold"] },
                "low_stock",
                "in_stock",
              ],
            },
          ],
        },
        count: { $sum: 1 },
        totalStock: { $sum: "$quantity" },
      },
    },
  ]);

  const lowStockAlerts = await Product.find(
    { $expr: { $lte: ["$quantity", "$lowStockThreshold"] } },
    { name: 1, sku: 1, quantity: 1, lowStockThreshold: 1 },
  )
    .limit(5)
    .lean();

  res.json({
    data: {
      stats: stats.reduce((acc: any, curr: any) => {
        acc[curr._id] = { count: curr.count, totalStock: curr.totalStock };
        return acc;
      }, {}),
      lowStockAlerts,
    },
  });
}
