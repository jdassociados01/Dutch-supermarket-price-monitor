import fs from "node:fs";
import path from "node:path";
import type { PriceResult, ProductConfig } from "./models.js";
import { chooseCheapest } from "./comparator.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCell(item: PriceResult | undefined, isWinner: boolean): string {
  const cls = isWinner ? ' class="winner"' : "";
  if (item && !item.error) {
    const parts = [`€${item.price?.toFixed(2)}`];
    if (item.normalized_price) {
      parts.push(`€${item.normalized_price.toFixed(2)}/${item.normalized_unit}`);
    }
    if (item.promotion) parts.push("Promoção");
    if (item.source_url) parts.push(`<a href="${item.source_url}">fonte</a>`);
    return `<td${cls}>${parts.join("<br>")}</td>`;
  }
  return `<td${cls}><span class="error">${escapeHtml(item?.error ?? "Não encontrado")}</span></td>`;
}

export function generateHtml(results: PriceResult[], products: ProductConfig[], stores: string[]): string {
  fs.mkdirSync("reports", { recursive: true });

  const matrix = new Map<string, PriceResult>();
  for (const r of results) matrix.set(`${r.product_id}::${r.store}`, r);
  const winners = chooseCheapest(results);

  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;

  const headerCells = stores.map((store) => `<th>${escapeHtml(store)}</th>`).join("");

  const rows = products
    .map((product) => {
      const winnerList = winners[product.id] ?? [];
      const cells = stores
        .map((store) => {
          const item = matrix.get(`${product.id}::${store}`);
          const isWinner = Boolean(item && winnerList.includes(item));
          return renderCell(item, isWinner);
        })
        .join("");
      const winnerCell = winnerList.length
        ? winnerList.map((w) => `${w.store} – €${w.normalized_price?.toFixed(2)}/${w.normalized_unit}`).join("<br>")
        : "Sem preço confirmado";
      return `<tr><td>${escapeHtml(product.display_name)}</td>${cells}<td>${winnerCell}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset='utf-8'><style>
body{font-family:Arial,sans-serif;color:#17233c}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;vertical-align:top}th{background:#f4f4f4}.winner{background:#dff5e3;font-weight:bold}.error{color:#9b1c1c;font-size:12px}
</style></head><body>
<h1>Preços dos supermercados – semana de ${todayStr}</h1>
<table><thead><tr><th>Produto</th>${headerCells}<th>Mais barato</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;

  const isoDate = today.toISOString().slice(0, 10);
  const filePath = path.join("reports", `prices-${isoDate}.html`);
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}
