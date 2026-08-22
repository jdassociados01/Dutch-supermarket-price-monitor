import "dotenv/config";
import { chromium } from "playwright";
import { ALL_STORES } from "./stores.js";
import { CHECK_FUNCTIONS } from "./scraper.js";
import type { PriceResult } from "./scraper.js";
import type { Product } from "./products.js";
import { readSearchQuery, writeSearchResults } from "./sheets.js";

function formatResult(result: PriceResult): string {
  if (result.status === "not_found") return "Não encontrado";
  if (result.status === "manual_check_needed") return "Verificação manual necessária";
  const parts = [`€${result.price?.toFixed(2) ?? "?"}`];
  if (result.quantity) parts.push(result.quantity);
  if (result.pricePerUnit) parts.push(result.pricePerUnit);
  if (result.promotion) parts.push(`promo: ${result.promotion}`);
  return parts.join(" | ");
}

async function run(): Promise<void> {
  const argQuery = process.argv.slice(2).join(" ").trim();
  const productName = argQuery || (await readSearchQuery());

  if (!productName) {
    console.log("Nenhum produto informado (nem argumento, nem célula B2 da aba 'Buscar Produto').");
    return;
  }

  // Produto avulso: usa o texto digitado como único termo de busca, sem
  // marca exigida (a curadoria de products.ts é só pra lista semanal fixa).
  const product: Product = {
    id: "busca_avulsa",
    displayName: productName,
    searchTerms: [productName],
    comparisonUnit: "kg",
  };

  console.log(`Buscando "${productName}" em ${ALL_STORES.length} lojas...`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results: PriceResult[] = [];

  try {
    for (const store of ALL_STORES) {
      const check = CHECK_FUNCTIONS[store];
      console.log(`Consultando ${store}...`);
      const result = await check(product, page);
      results.push(result);
      console.log(`  -> ${formatResult(result)}`);
    }
  } finally {
    await browser.close();
  }

  console.log("Escrevendo resultado na aba 'Buscar Produto'...");
  await writeSearchResults(productName, results);
  console.log("Planilha atualizada.");
}

run().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
