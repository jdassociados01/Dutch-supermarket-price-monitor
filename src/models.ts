import { z } from "zod";
import Decimal from "decimal.js";

export const ProductConfigSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  search_terms: z.array(z.string()),
  comparison_unit: z.string(),
  required_brand: z.string().nullable().optional(),
});
export type ProductConfig = z.infer<typeof ProductConfigSchema>;

export type Confidence = "high" | "medium" | "low";

export interface PriceResult {
  store: string;
  product_id: string;
  display_product_name: string;
  matched_product_name: string | null;
  brand: string | null;
  price: Decimal | null;
  currency: string;
  original_price: Decimal | null;
  package_quantity: Decimal | null;
  package_unit: string | null;
  normalized_price: Decimal | null;
  normalized_unit: string | null;
  promotion: boolean;
  promotion_conditions: string | null;
  loyalty_card_required: boolean;
  vat_included: boolean;
  availability: boolean | null;
  product_url: string | null;
  source_url: string | null;
  confidence: Confidence;
  checked_at: Date;
  error: string | null;
}

type PriceResultInput = Pick<PriceResult, "store" | "product_id" | "display_product_name"> &
  Partial<Omit<PriceResult, "store" | "product_id" | "display_product_name">>;

const PRICE_RESULT_DEFAULTS = {
  matched_product_name: null,
  brand: null,
  price: null,
  currency: "EUR",
  original_price: null,
  package_quantity: null,
  package_unit: null,
  normalized_price: null,
  normalized_unit: null,
  promotion: false,
  promotion_conditions: null,
  loyalty_card_required: false,
  vat_included: true,
  availability: null,
  product_url: null,
  source_url: null,
  confidence: "low" as Confidence,
  error: null,
} satisfies Partial<PriceResult>;

export function createPriceResult(input: PriceResultInput): PriceResult {
  return {
    ...PRICE_RESULT_DEFAULTS,
    checked_at: new Date(),
    ...input,
  };
}
