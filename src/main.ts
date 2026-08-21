import "dotenv/config";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { DateTime } from "luxon";
import { ACTIVE_STORES } from "./stores.js";
import type { StoreName } from "./stores.js";
import type { Product } from "./products.js";
import { checkAlbertHeijn, checkJumbo, checkHoogvliet, checkLidl, checkAldi, checkMakro } from "./scraper.js";
import type { PriceResult } from "./scraper.js";
import { generateHtml, generateCsv } from "./report.js";
import { sendReportEmail } from "./email.js";
import { loadSheetProducts, writeResultsToSheet } from "./sheets.js";

const CHECK_FUNCTIONS: Record<StoreName, (product: Product, page: Page) => Promise<PriceResult>> = {
  "Albert Heijn": checkAlbertHeijn,
  Jumbo: checkJumbo,
  Hoogvliet: checkHoogvliet,
  Lidl: checkLidl,
  Aldi: checkAldi,
  Makro: checkMakro,
};

// Roda toda segunda de manhã (verificação semanal completa) e toda
// sexta à tarde (para a lista de compras do fim de semana).
function scheduledTimeIsValid(): boolean {
  const now = DateTime.now().setZone("Europe/Amsterdam");
  const mondayMorning = now.weekday === 1 && now.hour === 8;
  const fridayAfternoon = now.weekday === 5 && now.hour === 15;
  return mondayMorning || fridayAfternoon;
}

function weekLabel(): string {
  return DateTime.now().setZone("Europe/Amsterdam").toFormat("dd-MM-yyyy");
}

function formatResult(result: PriceResult): string {
  if (result.status === "not_found") return "Não encontrado";
  if (result.status === "manual_check_needed") return "Verificação manual necessária";
  const parts = [`€${result.price?.toFixed(2) ?? "?"}`];
  if (result.quantity) parts.push(result.quantity);
  if (result.pricePerUnit) parts.push(result.pricePerUnit);
  if (result.promotion) parts.push(`promo: ${result.promotion}`);
  return parts.join(" | ");
}

async function run(manual: boolean, sendEmail: boolean): Promise<void> {
  if (!manual && !scheduledTimeIsValid()) {
    console.log("Execução ignorada: fora de segunda 08:00 / sexta 15:00 Europe/Amsterdam.");
    return;
  }

  console.log("Lendo produtos da planilha (aba 'Lista de Compras Semanais')...");
  const sheetInfo = await loadSheetProducts();
  const products = sheetInfo.rows.map((r) => r.product);
  console.log(`${products.length} produtos encontrados na planilha.`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results: PriceResult[] = [];

  try {
    for (const product of products) {
      for (const store of ACTIVE_STORES) {
        const check = CHECK_FUNCTIONS[store];
        console.log(`Consultando ${store} - ${product.displayName}...`);
        const result = await check(product, page);
        results.push(result);
        console.log(`  -> ${formatResult(result)}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log("Escrevendo resultados de volta na planilha...");
  await writeResultsToSheet(sheetInfo, results);
  console.log("Planilha atualizada.");

  const label = weekLabel();
  const htmlPath = generateHtml(products, results, label);
  const csvPath = generateCsv(products, results, label);
  console.log(`Relatório HTML: ${htmlPath}`);
  console.log(`Relatório CSV: ${csvPath}`);

  if (sendEmail) {
    await sendReportEmail(htmlPath, label);
    console.log("E-mail enviado.");
  }
}

const args = process.argv.slice(2);
const manual = args.includes("--manual");
const sendEmailFlag = args.includes("--send-email");

run(manual, sendEmailFlag).catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
