import fs from "node:fs";
import path from "node:path";
import { ALL_STORES } from "./stores.js";
import type { PriceResult } from "./scraper.js";
import type { Product } from "./products.js";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface UnitValue {
  value: number;
  unit: "kg" | "unit";
}

/** "1+1 gratis" -> compra 1, leva 2 -> multiplicador 0.5 no preço unitário
 * efetivo. "2+1 gratis" -> compra 2, leva 3 -> 2/3. Sem promoção desse tipo,
 * multiplicador 1 (preço normal). */
function promotionMultiplier(promotion: string | null): number {
  if (!promotion) return 1;
  const match = /(\d+)\s*\+\s*(\d+)\s*gratis/i.exec(promotion);
  if (!match) return 1;
  const buy = Number(match[1]);
  const free = Number(match[2]);
  return buy > 0 ? buy / (buy + free) : 1;
}

function parseWeightToKg(text: string): number | null {
  const match = /([\d.,]+)\s*(kg|g)\b/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]!.replace(",", "."));
  if (!(value > 0)) return null;
  return /kg/i.test(match[2]!) ? value : value / 1000;
}

function parseUnitCount(text: string): number | null {
  if (/^per\s+stuk$/i.test(text.trim())) return 1;
  const match = /(\d+)\s*stuks?\b/i.exec(text);
  if (match) {
    const value = Number(match[1]);
    return value > 0 ? value : null;
  }
  return null;
}

/**
 * Todos os valores comparáveis (€/kg e/ou €/unidade) que dá pra extrair de um
 * resultado, já aplicando o multiplicador de promoções tipo "1+1 gratis"
 * (preço efetivo por unidade, não o preço cheio). Prioriza o €/kg ou €/stuk
 * que a própria loja já calculou (`pricePerUnit`); quando não existe, deriva
 * da quantidade (ex.: "450 g", "2 stuks") e do preço mostrado.
 */
export function perUnitValues(result: PriceResult): UnitValue[] {
  if (result.status !== "ok") return [];
  const multiplier = promotionMultiplier(result.promotion);
  const values: UnitValue[] = [];

  if (result.pricePerUnit) {
    const match = /([\d.,]+)\s*(?:per|\/)\s*(kilo|kg|stuk)/i.exec(result.pricePerUnit);
    if (match) {
      const unit = /stuk/i.test(match[2]!) ? "unit" : "kg";
      values.push({ value: Number(match[1]!.replace(",", ".")) * multiplier, unit });
    }
  }

  if (result.price !== null && result.quantity) {
    const weightKg = parseWeightToKg(result.quantity);
    if (weightKg !== null) {
      values.push({ value: (result.price / weightKg) * multiplier, unit: "kg" });
    }
    const count = parseUnitCount(result.quantity);
    if (count !== null) {
      values.push({ value: (result.price / count) * multiplier, unit: "unit" });
    }
  }

  return values;
}

/** Primeiro valor comparável disponível (compat: quando só interessa "tem
 * algum preço por unidade ou não", sem se importar com qual). */
export function perUnitValue(result: PriceResult): UnitValue | null {
  return perUnitValues(result)[0] ?? null;
}

export function cellText(result: PriceResult | undefined): string {
  if (!result) return "";
  if (result.status === "not_found") return "Não encontrado";
  if (result.status === "manual_check_needed") return "Verificação manual necessária";

  const parts: string[] = [];
  if (result.price !== null) parts.push(`€${result.price.toFixed(2)}`);
  if (result.quantity) parts.push(result.quantity);
  if (result.pricePerUnit) parts.push(result.pricePerUnit);
  if (result.promotion) parts.push(`Promoção: ${result.promotion}`);
  return parts.join(" — ") || "Não encontrado";
}

/**
 * Só compara preços dentro da mesma unidade (kg com kg, unidade com
 * unidade) — nunca "€0,40 por banana" contra "€1,39 por kg", por exemplo.
 * Já usa o preço efetivo de promoções tipo "1+1 gratis" (ver perUnitValues).
 * Quando os resultados disponíveis usam unidades diferentes entre si e o
 * produto não deixa claro qual usar, não declara vencedor.
 */
export function findCheapestStores(rowResults: (PriceResult | undefined)[], comparisonUnit: "kg" | "unit"): Set<string> {
  const withValue = rowResults
    .filter((r): r is PriceResult => !!r)
    .flatMap((r) => perUnitValues(r).map((unitValue) => ({ result: r, unitValue })))
    .filter((x) => x.unitValue.unit === comparisonUnit);

  if (withValue.length === 0) return new Set();
  const min = Math.min(...withValue.map((x) => x.unitValue.value));
  return new Set(withValue.filter((x) => x.unitValue.value === min).map((x) => x.result.store));
}

export function generateHtml(products: Product[], results: PriceResult[], weekLabel: string): string {
  fs.mkdirSync("reports", { recursive: true });

  const byProductAndStore = new Map<string, PriceResult>();
  for (const r of results) byProductAndStore.set(`${r.productId}::${r.store}`, r);

  const headerCells = ALL_STORES.map((s) => `<th>${s}</th>`).join("");

  const rows = products
    .map((product) => {
      const rowResults = ALL_STORES.map((store) => byProductAndStore.get(`${product.id}::${store}`));
      const cheapest = findCheapestStores(rowResults, product.comparisonUnit);

      const cells = ALL_STORES.map((store) => {
        const result = byProductAndStore.get(`${product.id}::${store}`);
        const isWinner = !!result && cheapest.has(store);
        const text = escapeHtml(cellText(result));
        const link = result?.status === "ok" && result.url ? `<br><a href="${result.url}">link</a>` : "";
        return `<td${isWinner ? ' style="background:#c9f2c9;font-weight:bold"' : ""}>${text}${link}</td>`;
      }).join("");

      const winnerLabel =
        cheapest.size > 0
          ? [...cheapest].join(", ")
          : "Sem vencedor claro";

      return `<tr><td>${escapeHtml(product.displayName)}</td>${cells}<td>${winnerLabel}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;color:#17233c}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:8px;vertical-align:top;font-size:14px}
th{background:#f4f4f4}
</style></head><body>
<h1>Preços dos supermercados – semana de ${weekLabel}</h1>
<table><thead><tr><th>Produto</th>${headerCells}<th>Mais barato</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;

  const filePath = path.join("reports", `prices-${weekLabel}.html`);
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}

export function generateCsv(products: Product[], results: PriceResult[], weekLabel: string): string {
  fs.mkdirSync("reports", { recursive: true });

  const byProductAndStore = new Map<string, PriceResult>();
  for (const r of results) byProductAndStore.set(`${r.productId}::${r.store}`, r);

  const header = ["Produto", ...ALL_STORES, "Mais barato"];
  const lines = [header.join(";")];

  for (const product of products) {
    const rowResults = ALL_STORES.map((store) => byProductAndStore.get(`${product.id}::${store}`));
    const cheapest = findCheapestStores(rowResults, product.comparisonUnit);
    const cells = ALL_STORES.map((store) => {
      const result = byProductAndStore.get(`${product.id}::${store}`);
      const text = cellText(result).replace(/;/g, ",");
      return result?.status === "ok" && result.url ? `${text} (${result.url})` : text;
    });
    const winnerLabel = cheapest.size > 0 ? [...cheapest].join(", ") : "Sem vencedor claro";
    lines.push([product.displayName, ...cells, winnerLabel].join(";"));
  }

  const filePath = path.join("reports", `prices-${weekLabel}.csv`);
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}
