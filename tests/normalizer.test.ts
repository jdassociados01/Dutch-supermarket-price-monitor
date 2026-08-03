import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { normalizePrice, addVat } from "../src/normalizer.js";

describe("normalizer", () => {
  it("converts grams to kg", () => {
    expect(normalizePrice(new Decimal("2.50"), new Decimal("500"), "g", "kg").toFixed(2)).toBe("5.00");
  });

  it("handles unit-based products", () => {
    expect(normalizePrice(new Decimal("3.00"), new Decimal("3"), "unit", "unit").toFixed(2)).toBe("1.00");
  });

  it("adds vat", () => {
    expect(addVat(new Decimal("10.00"), new Decimal("0.09")).toFixed(2)).toBe("10.90");
  });

  it("rejects incompatible units", () => {
    expect(() => normalizePrice(new Decimal("1"), new Decimal("1"), "g", "unit")).toThrow();
  });
});
