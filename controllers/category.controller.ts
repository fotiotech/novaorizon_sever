import type { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import slugify from "slugify";
import Category from "../models/Category.js";
import CategoryProperty from "../models/CategoryProperty.js";
import AttributeSet from "../models/AttributeSet.js";
import AttributeGroup from "../models/AttributeGroup.js";
import Attribute from "../models/Attribute.js";
import { connection } from "../config/db.js";
import { AppError, ValidationError } from "../middleware/error.middleware.js";
import { getCategoryAttributeSets as buildCategoryAttributeSets } from "../utils/category-inheritance.js";
import { deleteS3Object } from "../utils/s3.js";

/* ------------------------------- helpers ---------------------------------- */

function param(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function projectForList<T extends Record<string, any>>(category: T) {
  // Strip the retired legacy pointer if an un-migrated document still has it.
  const { inheritedProperty: _legacy, ...rest } = category;
  return {
    ...rest,
    property: category.property ?? null,
  };
}

function generateSlug(name: string): string {
  return slugify(name, { lower: true, strict: true });
}

async function getUniqueCategorySlug(
  name: string,
  parentId?: string | null,
  excludeId?: string | null,
): Promise<string> {
  const normalized = (name || "").trim();
  if (!normalized) return "category";

  let base = generateSlug(normalized);

  if (parentId) {
    const parent: any = await Category.findById(parentId)
      .select("slug name")
      .lean();
    if (parent) {
      const parentSlug = parent.slug || generateSlug(parent.name || "");
      base = `${parentSlug}>${generateSlug(normalized)}`;
    }
  }

  let candidate = base;
  let suffix = 2;
  while (
    await Category.exists({
      slug: candidate,
      _id: { $ne: excludeId ?? undefined },
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function assertValidId(id: string, field = "id"): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new ValidationError({ [field]: [`Invalid ${field}`] });
  }
}

/* ------------------------------- GET list --------------------------------- */

export async function listCategories(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const categories = await Category.find().populate("property").lean();
  res.json({ data: categories.map(projectForList) });
}

export async function getCategoryById(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  await connection();
  assertValidId(id);

  const category = await Category.findById(id).populate("property").lean();
  if (!category) throw new AppError("Category not found", 404);

  res.json({ data: projectForList(category) });
}

export async function listChildren(req: Request, res: Response): Promise<void> {
  const id = param(req, "id");
  await connection();
  assertValidId(id);

  const subCategories = await Category.find({ parentId: id })
    .populate("property")
    .lean();
  res.json({ data: subCategories });
}

export async function listChildrenByName(
  req: Request,
  res: Response,
): Promise<void> {
  const name = param(req, "name");
  await connection();

  const parent = await Category.findOne({ name });
  if (!parent) {
    res.json({ data: [] });
    return;
  }

  const subCategories = await Category.find({ parentId: parent._id })
    .populate("property")
    .lean();
  res.json({ data: subCategories });
}

export async function getCategoriesForTree(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();

  const rows = await Category.find(
    {},
    "_id name slug parentId imageUrl description sortOrder updatedAt",
  )
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  res.json({
    data: rows.map((c: any) => ({
      _id: String(c._id),
      name: String(c.name ?? ""),
      slug: String(c.slug ?? ""),
      parentId: c.parentId ? String(c.parentId) : null,
      imageUrl: Array.isArray(c.imageUrl) ? c.imageUrl.map(String) : [],
      description: c.description ?? null,
      sortOrder: typeof c.sortOrder === "number" ? c.sortOrder : null,
      updatedAt:
        c.updatedAt instanceof Date
          ? c.updatedAt.toISOString()
          : (c.updatedAt ?? null),
    })),
  });
}

/* -------------------------- CREATE / UPDATE ------------------------------- */

interface CategoryBody {
  name?: string;
  parentId?: string | null;
  description?: string;
  imageUrl?: string[];
  propertyId?: string | null;
  inheritProperty?: boolean;
}

async function createOrUpdateCategory(
  body: CategoryBody,
  id: string | null,
  res: Response,
): Promise<void> {
  await connection();

  const { name, parentId, description, imageUrl, propertyId, inheritProperty } =
    body;

  if (!name || !name.trim()) {
    throw new ValidationError({ name: ["Category name is required."] });
  }

  const resolvedParentId = parentId || null;
  if (id && resolvedParentId && id === resolvedParentId) {
    throw new ValidationError({
      parentId: ["A category cannot be its own parent."],
    });
  }
  if (resolvedParentId) assertValidId(resolvedParentId, "parentId");
  if (propertyId) assertValidId(propertyId, "propertyId");
  if (id) assertValidId(id);

  if (resolvedParentId && id) {
    let currentParentId: string | null = resolvedParentId;
    const seen = new Set<string>();
    while (currentParentId && !seen.has(currentParentId)) {
      seen.add(currentParentId);
      const parent: any = await Category.findById(currentParentId)
        .select("parentId")
        .lean();
      if (!parent) break;
      if (parent.parentId && String(parent.parentId) === id) {
        throw new ValidationError({
          parentId: [
            "A category cannot be assigned to one of its descendants.",
          ],
        });
      }
      currentParentId = parent.parentId ? String(parent.parentId) : null;
    }
  }

  const slugValue = await getUniqueCategorySlug(
    name,
    resolvedParentId,
    id || undefined,
  );

  const canInherit = !!resolvedParentId;
  const wantsInherit = inheritProperty === true && canInherit;

  const existing = id ? await Category.findById(id) : null;

  if (existing) {
    const updateData: Record<string, any> = {
      name,
      parentId: resolvedParentId,
      slug: slugValue,
      description: description ?? null,
      imageUrl: imageUrl ?? [],
      inheritProperty: wantsInherit,
      property: propertyId ?? null,
    };

    await Category.findByIdAndUpdate(existing._id, { $set: updateData });

    const updated = await Category.findById(existing._id).lean();
    res.json({ success: true, data: projectForList(updated as any) });
    return;
  }

  const created = await Category.create({
    slug: slugValue,
    name,
    parentId: resolvedParentId,
    description: description ?? null,
    imageUrl: imageUrl ?? [],
    inheritProperty: wantsInherit,
    property: propertyId ?? null,
  });

  const fresh = (await Category.findById(created._id).lean()) ?? created.toObject();
  res.status(201).json({ success: true, data: projectForList(fresh as any) });
}

export async function createCategory(
  req: Request,
  res: Response,
): Promise<void> {
  await createOrUpdateCategory(req.body ?? {}, null, res);
}

export async function updateCategory(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  assertValidId(id);
  await createOrUpdateCategory(req.body ?? {}, id, res);
}

/* ------------------------------- DELETE ----------------------------------- */

export async function deleteCategory(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  await connection();
  assertValidId(id);

  const category = await Category.findById(id).select("_id").lean();
  if (!category) throw new AppError("Category not found", 404);

  // Children become roots: inheritance has nothing left to merge.
  await Category.updateMany(
    { parentId: id },
    { $set: { parentId: null, inheritProperty: false } },
  );

  await mongoose.models.Product?.updateMany(
    { categoryId: id },
    { $unset: { categoryId: "" } },
  );

  await Category.findByIdAndDelete(id);

  res.json({ success: true, message: "Category deleted successfully" });
}

/* ------------------------- Property assignment --------------------------- */

export async function assignCategoryProperty(
  req: Request,
  res: Response,
): Promise<void> {
  const categoryId = param(req, "id");
  await connection();
  assertValidId(categoryId);

  const propertyId = (req.body?.propertyId ?? null) as string | null;
  if (propertyId) assertValidId(propertyId, "propertyId");

  const category = await Category.findById(categoryId).select("property");
  if (!category) throw new AppError("Category not found", 404);

  if (propertyId) {
    const prop = await CategoryProperty.findById(propertyId).select("readOnly");
    if (!prop) throw new AppError("Property not found", 404);
    if (prop.readOnly) {
      throw new AppError(
        "System-managed (inherited) properties cannot be assigned manually.",
        400,
      );
    }
  }

  const previous = category.property?.toString() ?? null;
  const next = propertyId ?? null;
  if (previous === next) {
    res.json({ success: true });
    return;
  }

  category.property = next ? new Types.ObjectId(next) : null;
  await category.save();

  res.json({ success: true });
}

/* -------------------------- Attribute sets ------------------------------- */

export async function getCategoryAttributeSetsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  await connection();
  assertValidId(id);
  const sets = await buildCategoryAttributeSets(id);
  res.json({ data: sets });
}

/* ---------------------------- Meta endpoints ----------------------------- */

export async function getAllAttributeSets(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const sets = await AttributeSet.find()
    .select("_id title code")
    .sort({ sortOrder: 1 })
    .lean();
  res.json({ data: sets });
}

export async function getAllAttributeGroups(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const groups = await AttributeGroup.find().select("_id name code").lean();
  res.json({ data: groups });
}

export async function getAllAttributes(
  _req: Request,
  res: Response,
): Promise<void> {
  await connection();
  const attrs = await Attribute.find().select("_id name code type").lean();
  res.json({ data: attrs });
}

/* ---------------------------- Image deletion ----------------------------- */

export async function deleteCategoryImage(
  req: Request,
  res: Response,
): Promise<void> {
  const id = param(req, "id");
  await connection();
  assertValidId(id);

  const imageUrl = req.body?.imageUrl as string | undefined;
  if (!imageUrl) {
    throw new ValidationError({ imageUrl: ["imageUrl is required."] });
  }

  const category = await Category.findById(id);
  if (!category) throw new AppError("Category not found", 404);

  if (!category.imageUrl?.includes(imageUrl)) {
    throw new AppError("Image not found in category", 404);
  }

  await deleteS3Object(imageUrl);

  category.imageUrl = category.imageUrl.filter((u) => u !== imageUrl);
  await category.save();

  res.json({ success: true, data: category.imageUrl });
}