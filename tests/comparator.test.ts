import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { createPriceResult } from "../src/models.js";
import { chooseCheapest } from "../src/comparator.js";

function item(store: string, value: string) {
  return createPriceResult({
    store,
    product_id: "banana",
    display_product_name: "Banaan",
    price: new Decimal(value),
    normalized_price: new Decimal(value),
    normalized_unit: "kg",
    confidence: "high",
    availability: true,
  });
}

describe("comparator", () => {
  it("finds the cheapest and keeps ties", () => {
    const winners = chooseCheapest([item("A", "2.00"), item("B", "1.50"), item("C", "1.50")]);
    expect(new Set(winners.banana!.map((x) => x.store))).toEqual(new Set(["B", "C"]));
  });

  it("ignores results with errors or low confidence", () => {
    const withError = createPriceResult({
      store: "D",
      product_id: "banana",
      display_product_name: "Banaan",
      error: "not found",
    });
    const winners = chooseCheapest([item("A", "2.00"), withError]);
    expect(winners.banana!.map((x) => x.store)).toEqual(["A"]);
  });
});
