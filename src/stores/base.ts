import { createPriceResult } from "../models.js";
import type { ProductConfig, PriceResult } from "../models.js";

export interface StoreConnector {
  name: string;
  search(product: ProductConfig): Promise<PriceResult>;
}

/**
 * Stub connector used until a store's official source has been validated
 * (see docs/source-assessment.md). Never invent prices or bypass CAPTCHA/login.
 */
export function unvalidatedConnector(name: string): StoreConnector {
  return {
    name,
    async search(product: ProductConfig): Promise<PriceResult> {
      return createPriceResult({
        store: name,
        product_id: product.id,
        display_product_name: product.display_name,
        error: "Conector ainda precisa ser validado contra a fonte oficial.",
        confidence: "low",
      });
    },
  };
}
