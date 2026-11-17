import { z } from "zod";

const ProductCodeSchema = z.object({
  type: z.enum(["EAN", "UPC", "ISBN", "QR", "MODEL"]),
  value: z.string().trim().min(1, "Product code value is required"),
});

const VariantSchema = z
  .object({
    sku: z.string().default(""),
    price: z.number().min(0).default(0),
    quantity: z.number().min(0).default(0),
    mainImage: z.string().default(""),
    images: z.array(z.string()).default([]),
  })
  .passthrough();

const RelatedProductEntrySchema = z
  .object({
    product: z.union([z.string(), z.object({ _id: z.string() })]).optional(),
    id: z.string().optional(),
    relationshipType: z.string().optional(),
  })
  .refine((d) => d.product || d.id, {
    message: "Either product or id must be provided",
  });

const ProductCodeOrArraySchema = z
  .union([ProductCodeSchema, z.array(ProductCodeSchema), z.null()])
  .transform((val) => (Array.isArray(val) ? (val[0] ?? null) : val))
  .nullable()
  .optional();

export const CreateOrUpdateProductSchema = z
  .object({
    _id: z.string().optional(),
    categoryId: z.string().min(1).optional(),
    brand: z.string().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    sku: z.string().trim().optional(),
    description: z.string().optional(),
    shortDescription: z.string().optional(),
    quantity: z.number().min(0).default(0).optional(),
    lowStockThreshold: z.number().min(0).default(5).optional(),
    listPrice: z.number().min(0).default(0).optional(),
    price: z.number().min(0).default(0).optional(),
    images: z.array(z.string()).default([]).optional(),
    hasVariants: z.boolean().default(false).optional(),
    variantThemes: z.array(z.string()).default([]).optional(),
    variantValues: z
      .union([z.array(z.any()), z.record(z.string(), z.any())])
      .optional(),
    variants: z.array(VariantSchema).default([]).optional(),
    carrier: z.string().optional(),
    relatedProducts: z.array(RelatedProductEntrySchema).default([]).optional(),
    tags: z.array(z.string()).default([]).optional(),
    status: z.enum(["draft", "active", "inactive"]).default("draft").optional(),
    productCode: ProductCodeOrArraySchema,
  })
  .passthrough();

export function safeValidateProductCreateOrUpdate(data: unknown) {
  try {
    return {
      success: true as const,
      data: CreateOrUpdateProductSchema.parse(data),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false as const,
        // Zod 4: `.issues`. Zod 3's `.errors` is deprecated.
        error: error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; "),
      };
    }
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Validation failed",
    };
  }
}
