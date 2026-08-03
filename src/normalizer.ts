import Decimal from "decimal.js";

const UNIT_TO_KG: Record<string, Decimal> = {
  g: new Decimal("0.001"),
  kg: new Decimal("1"),
};

const UNIT_TO_L: Record<string, Decimal> = {
  ml: new Decimal("0.001"),
  cl: new Decimal("0.01"),
  l: new Decimal("1"),
};

const UNIT_ALIASES = new Set(["unit", "piece", "stuk"]);

export function normalizePrice(price: Decimal, quantity: Decimal, unit: string, target: string): Decimal {
  const u = unit.toLowerCase();
  const t = target.toLowerCase();
  if (quantity.lte(0)) {
    throw new Error("Quantity must be positive");
  }
  if (t === "kg" && u in UNIT_TO_KG) {
    return price.div(quantity.mul(UNIT_TO_KG[u]!)).toDecimalPlaces(2);
  }
  if (t === "l" && u in UNIT_TO_L) {
    return price.div(quantity.mul(UNIT_TO_L[u]!)).toDecimalPlaces(2);
  }
  if (t === "unit" && UNIT_ALIASES.has(u)) {
    return price.div(quantity).toDecimalPlaces(2);
  }
  throw new Error(`Incompatible units: ${unit} -> ${target}`);
}

export function addVat(netPrice: Decimal, vatRate: Decimal): Decimal {
  return netPrice.mul(new Decimal(1).plus(vatRate)).toDecimalPlaces(2);
}
