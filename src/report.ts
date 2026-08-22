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

/** Extrai um valor numérico E a unidade de "€1,16 per stuk" / "€6,65 per kilo".
 * Nunca compara €/kg com €/unidade — são coisas diferentes. */
export function perUnitValue(result: PriceResult): UnitValue | null {
  if (result.status !== "ok" || !result.pricePerUnit) return null;
  const match = /([\d.,]+)\s*(?:per|\/)\s*(kilo|kg|stuk)/i.exec(result.pricePerUnit);
  if (!match) return null;
  const unit = /stuk/i.test(match[2]!) ? "unit" : "kg";
  return { value: Number(match[1]!.replace(",", ".")), unit };
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
 * Quando os resultados disponíveis usam unidades diferentes entre si e o
 * produto não deixa claro qual usar, não declara vencedor.
 */
export function findCheapestStores(rowResults: (PriceResult | undefined)[], comparisonUnit: "kg" | "unit"): Set<string> {
  const withValue = rowResults
    .filter((r): r is PriceResult => !!r)
    .map((r) => ({ result: r, unitValue: perUnitValue(r) }))
    .filter((x): x is { result: PriceResult; unitValue: UnitValue } => x.unitValue !== null && x.unitValue.unit === comparisonUnit);

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
