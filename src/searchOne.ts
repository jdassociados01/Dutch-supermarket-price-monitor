import "dotenv/config";
import { chromium } from "playwright";
import { ALL_STORES } from "./stores.js";
import { CHECK_FUNCTIONS } from "./scraper.js";
import type { PriceResult } from "./scraper.js";
import { readSearchQuery, writeSearchResults, resolveSheetProduct } from "./sheets.js";
import { sendSearchDoneEmail } from "./email.js";

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

  // Mesma correção de digitação da lista semanal: se o que foi digitado
  // parecer com um produto já cadastrado em products.ts (ex.: "Lindhals
  // Protein" -> "Lindahls Protein"), usa os termos de busca e a marca
  // corretos daquele produto em vez do texto digitado literalmente.
  const product = resolveSheetProduct(productName, 0);
  if (product.displayName !== productName) {
    console.log(`Corrigido para produto conhecido: "${product.displayName}" (termos: ${product.searchTerms.join(", ")}).`);
  }

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

  try {
    await sendSearchDoneEmail(productName);
    console.log("E-mail de aviso enviado.");
  } catch (err) {
    console.log(`Aviso: não consegui enviar o e-mail (${(err as Error).message}). A planilha já foi atualizada de qualquer forma.`);
  }
}

run().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
