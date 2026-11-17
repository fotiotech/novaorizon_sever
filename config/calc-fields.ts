/**
 * TODO: replace with the real CALC_FIELDS from
 * `app/lib/validation/calc-fields.ts`.
 *
 * Each entry defines the configurable fields that appear in the admin
 * promotion composer when a given calculation type is selected. Missing
 * an entry means the composer renders zero fields for that type.
 */
export interface CalcFieldDef {
  code: string;
  name: string;
  type:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "multi-select"
    | "checkbox"
    | "radio"
    | "boolean"
    | "date"
    | "color"
    | "file"
    | "url";
  isRequired?: boolean;
  options?: string[];
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export const CALC_FIELDS: Record<string, CalcFieldDef[]> = {
  percentage: [
    {
      code: "percent",
      name: "Discount (%)",
      type: "number",
      isRequired: true,
      validation: { min: 0, max: 100 },
    },
  ],
  fixed_amount: [
    {
      code: "amount",
      name: "Discount amount",
      type: "number",
      isRequired: true,
      validation: { min: 0 },
    },
  ],
  buy_x_get_y: [
    {
      code: "buyQty",
      name: "Buy quantity",
      type: "number",
      isRequired: true,
      validation: { min: 1 },
    },
    {
      code: "getQty",
      name: "Get quantity",
      type: "number",
      isRequired: true,
      validation: { min: 1 },
    },
    {
      code: "discountOnY",
      name: "Discount on Y (%)",
      type: "number",
      validation: { min: 0, max: 100 },
      defaultValue: 100,
    },
  ],
  free_shipping: [
    {
      code: "minSubtotal",
      name: "Minimum subtotal",
      type: "number",
      isRequired: true,
      validation: { min: 0 },
    },
  ],
  bundle_discount: [
    {
      code: "minItems",
      name: "Minimum items",
      type: "number",
      isRequired: true,
      validation: { min: 1 },
    },
    {
      code: "percent",
      name: "Discount (%)",
      type: "number",
      isRequired: true,
      validation: { min: 0, max: 100 },
    },
  ],
};
