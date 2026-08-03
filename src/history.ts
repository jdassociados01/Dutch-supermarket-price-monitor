import fs from "node:fs";
import path from "node:path";
import Decimal from "decimal.js";
import type { PriceResult } from "./models.js";

const DATA_DIR = "data";

function serialize(r: PriceResult) {
  return {
    ...r,
    price: r.price?.toString() ?? null,
    original_price: r.original_price?.toString() ?? null,
    package_quantity: r.package_quantity?.toString() ?? null,
    normalized_price: r.normalized_price?.toString() ?? null,
    checked_at: r.checked_at.toISOString(),
  };
}

export function saveLatest(results: PriceResult[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload = results.map(serialize);
  fs.writeFileSync(path.join(DATA_DIR, "latest.json"), JSON.stringify(payload, null, 2), "utf-8");
}

const FIELDS = [
  "checked_at",
  "product_id",
  "display_product_name",
  "store",
  "price",
  "normalized_price",
  "normalized_unit",
  "promotion",
  "confidence",
  "source_url",
  "error",
] as const satisfies readonly (keyof PriceResult)[];

function stringifyField(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function csvEscape(field: string): string {
  if (/[",\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function appendHistory(results: PriceResult[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, "history.csv");
  const exists = fs.existsSync(filePath);
  const lines: string[] = [];
  if (!exists) {
    lines.push(FIELDS.join(","));
  }
  for (const r of results) {
    lines.push(FIELDS.map((field) => csvEscape(stringifyField(r[field]))).join(","));
  }
  fs.appendFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}
