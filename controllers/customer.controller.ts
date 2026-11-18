import type { Request, Response } from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";

/**
 * Admin customer directory. The `Customer` collection holds billing/shipping
 * data linked to a `User`; these handlers expose it to the back office.
 */

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function listCustomers(
  req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const { page = "1", limit = "10", search } = req.query as Record<
    string,
    string | undefined
  >;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const query: Record<string, any> = {};
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [
      { "billingAddress.firstName": re },
      { "billingAddress.lastName": re },
      { "billingAddress.email": re },
    ];
  }

  const [total, customers] = await Promise.all([
    Customer.countDocuments(query),
    Customer.find(query)
      .populate("userId", "email phone")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
  ]);

  res.json({
    data: {
      customers: JSON.parse(JSON.stringify(customers)).map((c: any) => ({
        ...c,
        userId: c.userId?._id ?? c.userId,
      })),
      total,
      pages: Math.ceil(total / limitNum) || 0,
      currentPage: pageNum,
    },
  });
}

export async function getCustomer(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  await connection();

  const customer: any = mongoose.Types.ObjectId.isValid(id)
    ? await Customer.findById(id).lean()
    : await Customer.findOne({ userId: id }).lean();

  if (!customer) throw new AppError("Customer not found", 404);
  res.json({ data: JSON.parse(JSON.stringify(customer)) });
}

export async function deleteCustomer(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError({ id: ["Invalid customer id"] });
  }
  await connection();

  const deleted = await Customer.findByIdAndDelete(id);
  if (!deleted) throw new AppError("Customer not found", 404);
  res.json({ success: true });
}
