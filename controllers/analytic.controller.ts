// Express types are aliased so they cannot shadow the Fetch API's global
// `Request`/`Response` (the production/ Vercel TS build includes DOM libs).
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import "../models/Category.js";
import FacebookAdsSettings from "../models/FacebookAdsSettings.js";
import { connection } from "../config/db.js";
import type { UserAnalytics } from "../types/analytics.js";
import type { ProductAnalytics } from "../types/analytics.js";
import {
  getHotRightNow,
  getVisitorHistory,
} from "../utils/analytics.service.js";

/* --------------------------- user analytics ----------------------------- */

export async function getUserAnalytics(
  _req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  await connection();

  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ status: "active" });

  const usersByStatusResult = await User.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const usersByStatus: any = { active: 0, inactive: 0 };
  usersByStatusResult.forEach((item: any) => {
    if (item._id) usersByStatus[item._id] = item.count;
  });

  const usersByRoleResult = await User.aggregate([
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);
  const usersByRole: any = {};
  usersByRoleResult.forEach((item: any) => {
    usersByRole[item._id || "customer"] = item.count;
  });

  const currentYear = new Date().getFullYear();
  const monthlySignups = Array(12).fill(0);
  const startOfYear = new Date(currentYear, 0, 1);
  const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  const signupsByMonth = await User.aggregate([
    { $match: { createdAt: { $gte: startOfYear, $lte: endOfYear } } },
    { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
  ]);
  signupsByMonth.forEach((item: any) => {
    if (item._id >= 1 && item._id <= 12)
      monthlySignups[item._id - 1] = item.count;
  });

  // NOTE (fixed vs original): the original selected `fullName` which doesn't
  // exist on this User schema. Correct field is `name`. Also keep the select
  // aligned with that.
  const recentUsers = await User.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select("name email image role status createdAt updatedAt lastLoginAt")
    .lean<any[]>();

  const currentMonth = new Date().getMonth();
  const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const currentMonthSignups = monthlySignups[currentMonth];
  const previousMonthSignups = monthlySignups[previousMonth];

  const userGrowthRate =
    previousMonthSignups > 0
      ? ((currentMonthSignups - previousMonthSignups) / previousMonthSignups) *
        100
      : currentMonthSignups > 0
        ? 100
        : 0;

  const safeDate = (value: any): string | null => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  };

  const data: UserAnalytics = {
    totalUsers,
    activeUsers,
    newUsersThisMonth: currentMonthSignups,
    userGrowthRate,
    usersByStatus,
    usersByRole,
    monthlySignups,
    recentUsers: recentUsers.map((user) => ({
      _id: String(user._id ?? ""),
      name: user.name ?? "", // ← was user.fullName
      email: user.email ?? "",
      image: user.image ?? null,
      role: user.role ?? "customer",
      status: user.status ?? "active",
      joinDate: safeDate(user.createdAt) ?? "",
      lastActive:
        safeDate(user.lastLoginAt) ?? safeDate(user.updatedAt) ?? "Never",
    })),
  };

  res.json({ data });
}

/* --------------------------- order analytics ---------------------------- */

export async function getOrderAnalytics(
  _req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  await connection();

  const totalOrders = await Order.countDocuments();

  const revenueData = await Order.aggregate([
    { $match: { paymentStatus: "paid", orderStatus: { $ne: "cancelled" } } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$total" },
        averageOrderValue: { $avg: "$total" },
      },
    },
  ]);

  const ordersByStatus = await Order.aggregate([
    { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
  ]);

  const recentOrders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("userId", "email")
    .lean();

  res.json({
    data: {
      totalOrders,
      totalRevenue: revenueData[0]?.totalRevenue || 0,
      averageOrderValue: revenueData[0]?.averageOrderValue || 0,
      ordersByStatus: ordersByStatus.reduce(
        (acc: Record<string, number>, curr: any) => {
          if (curr._id) acc[curr._id] = curr.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      recentOrders: JSON.parse(JSON.stringify(recentOrders)),
    },
  });
}

/* -------------------------- product analytics --------------------------- */

export async function getProductAnalytics(
  _req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  await connection();

  const totalProducts = await Product.countDocuments();
  const activeProducts = await Product.countDocuments({ status: "active" });
  const outOfStock = await Product.countDocuments({ quantity: { $lte: 0 } });
  const lowStock = await Product.countDocuments({ quantity: { $lte: 1 } });

  const productsByStatusResult = await Product.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const productsByStatus: Record<string, number> = {
    active: 0,
    inactive: 0,
    draft: 0,
  };
  productsByStatusResult.forEach((item: any) => {
    if (item._id) productsByStatus[item._id] = item.count;
  });

  const productsByCategoryResult = await Product.aggregate([
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    { $group: { _id: "$category.name", count: { $sum: 1 } } },
  ]);
  const productsByCategory: Record<string, number> = {};
  productsByCategoryResult.forEach((item: any) => {
    productsByCategory[item._id || "Uncategorized"] = item.count;
  });

  const currentYear = new Date().getFullYear();
  const monthlyAdditions = Array(12).fill(0);
  const additionsByMonth = await Product.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(`${currentYear}-01-01`),
          $lte: new Date(`${currentYear}-12-31T23:59:59`),
        },
      },
    },
    { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
  ]);
  additionsByMonth.forEach((item: any) => {
    if (item._id >= 1 && item._id <= 12)
      monthlyAdditions[item._id - 1] = item.count;
  });

  const recentProducts = await Product.find()
    .populate({
      path: "categoryId",
      select: "name",
      options: { strictPopulate: false },
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select(
      "name sku price listPrice quantity lowStockThreshold images status categoryId",
    )
    .lean();

  const data: ProductAnalytics = {
    totalProducts,
    activeProducts,
    outOfStock,
    lowStock,
    productsByStatus,
    productsByCategory,
    monthlyAdditions,
    recentProducts: recentProducts.map((product: any) => ({
      ...product,
      _id: product._id?.toString(),
      // NOTE (preserved from original): `mainImage` doesn't exist on this
      // schema — Product has `images: string[]`. If the frontend needs a
      // single image, add `image: product.images?.[0] ?? null` here.
      category: product.categoryId?.name || "Uncategorized",
      createdAt: product.createdAt
        ? new Date(product.createdAt).toISOString().split("T")[0]
        : null,
    })),
  };
  res.json({ data });
}

/* ------------------------- facebook ads analytics ----------------------- */

export async function getFacebookAdsAnalytics(
  _req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  await connection();

  const settings: any = await FacebookAdsSettings.findOne()
    .select("+accessToken adAccountId apiVersion")
    .lean();

  if (!settings?.accessToken) {
    res.json({
      data: {
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        avgCPC: 0,
        totalConversions: 0,
        roi: 0,
        campaignCount: 0,
        isConfigured: false,
      },
    });
    return;
  }

  try {
    const url = `https://graph.facebook.com/${settings.apiVersion || "v20.0"}/${settings.adAccountId}/insights?fields=spend,impressions,clicks,actions&access_token=${encodeURIComponent(settings.accessToken)}`;
    // Explicitly typed: some CI/production TS setups resolve the Fetch API
    // `Response` to the Express one, so the shape is pinned here.
    const response: any = await fetch(url, { method: "GET" });

    if (!response?.ok) {
      res.json({
        data: {
          totalSpend: 0,
          totalImpressions: 0,
          totalClicks: 0,
          avgCPC: 0,
          totalConversions: 0,
          roi: 0,
          campaignCount: 0,
          isConfigured: true,
          error: "Unable to fetch Meta insights",
        },
      });
      return;
    }

    const payload: any = await response?.json();
    const data = Array.isArray(payload.data) ? payload.data[0] : null;

    if (!data) {
      res.json({
        data: {
          totalSpend: 0,
          totalImpressions: 0,
          totalClicks: 0,
          avgCPC: 0,
          totalConversions: 0,
          roi: 0,
          campaignCount: 0,
          isConfigured: true,
        },
      });
      return;
    }

    const spend = parseFloat(data.spend || "0");
    const impressions = parseInt(data.impressions || "0");
    const clicks = parseInt(data.clicks || "0");
    const conversions =
      data.actions?.find((a: any) => a.action_type === "omni_purchase")
        ?.value || 0;

    res.json({
      data: {
        totalSpend: spend,
        totalImpressions: impressions,
        totalClicks: clicks,
        avgCPC: clicks > 0 ? spend / clicks : 0,
        totalConversions: conversions,
        roi: spend > 0 ? ((conversions * 50 - spend) / spend) * 100 : 0,
        campaignCount: 0,
        isConfigured: true,
      },
    });
  } catch (err) {
    console.error("[analytic] Meta API error:", err);
    res.json({
      data: {
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        avgCPC: 0,
        totalConversions: 0,
        roi: 0,
        campaignCount: 0,
        isConfigured: true,
        error: "Meta API connection failed",
      },
    });
  }
}

/* --------------------------- overview data ------------------------------ */

export async function getOverviewData(
  _req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  await connection();

  const [totalUsers, activeUsers, newUsersThisMonth] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: "active" }),
    User.countDocuments({
      createdAt: {
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      },
    }),
  ]);

  const [totalProducts, activeProducts, outOfStock, lowStock] =
    await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ status: "active" }),
      Product.countDocuments({ quantity: { $lte: 0 } }),
      Product.countDocuments({ quantity: { $lte: 1 } }),
    ]);

  const [totalOrders, completedOrders] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ orderStatus: { $in: ["delivered", "completed"] } }),
  ]);

  const revenueResult = await Order.aggregate([
    { $match: { orderStatus: { $in: ["delivered", "completed"] } } },
    { $group: { _id: null, total: { $sum: "$total" } } },
  ]);
  const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
  const averageOrderValue =
    completedOrders > 0 ? totalRevenue / completedOrders : 0;

  // NOTE (fixed vs original): `fullName` → `name` (this schema doesn't have `fullName`)
  const [recentUsers, recentProducts, recentOrders] = await Promise.all([
    User.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select("name email createdAt")
      .lean<any[]>(),
    Product.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select("name sku createdAt")
      .lean(),
    Order.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select("orderNumber total createdAt")
      .lean(),
  ]);

  const safeIso = (value: any): string | null => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const recentActivity = [
    ...recentUsers.map((user: any) => ({
      type: "user",
      title: "New user registered",
      description: `${user.name || "Someone"} (${user.email ?? "—"}) joined`, // ← was user.fullName
      time: safeIso(user.createdAt) ?? new Date().toISOString(),
    })),
    ...recentProducts.map((product: any) => ({
      type: "product",
      title: "New product added",
      description: `${product.name || product.sku || "Product"} was added`,
      time: safeIso(product.createdAt) ?? new Date().toISOString(),
    })),
    ...recentOrders.map((order: any) => ({
      type: "order",
      title: "New order placed",
      description: `Order #${order.orderNumber} for $${order.total}`,
      time: safeIso(order.createdAt) ?? new Date().toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);

  res.json({
    data: {
      users: {
        total: totalUsers,
        active: activeUsers,
        newThisMonth: newUsersThisMonth,
        growthRate: totalUsers > 0 ? (newUsersThisMonth / totalUsers) * 100 : 0,
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        outOfStock,
        lowStock,
      },
      orders: {
        total: totalOrders,
        completed: completedOrders,
        revenue: totalRevenue,
        averageOrderValue,
      },
      recentActivity,
    },
  });
}

export async function getHotAnalytics(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const windowMinutes = Math.min(
    120,
    Math.max(1, Number(req.query.window) || 15),
  );
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));
  const data = await getHotRightNow(windowMinutes * 60 * 1000, limit);
  res.json({ items: data });
}

export async function getHistoryAnalytics(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const period = String(req.query.period ?? "day") as "day" | "week" | "month";
  if (!["day", "week", "month"].includes(period)) {
    res
      .status(400)
      .json({ errors: { period: ["Must be day, week, or month"] } });
    return;
  }
  const range = Math.min(90, Math.max(1, Number(req.query.range) || 30));
  const data = await getVisitorHistory(period, range);
  res.json({ points: data });
}