import "dotenv/config";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { DateTime } from "luxon";
import { PRODUCTS } from "./products.js";
import { ACTIVE_STORES } from "./stores.js";
import type { StoreName } from "./stores.js";
import type { Product } from "./products.js";
import { checkAlbertHeijn, checkJumbo, checkHoogvliet, checkLidl, checkAldi, checkMakro } from "./scraper.js";
import type { PriceResult } from "./scraper.js";
import { generateHtml, generateCsv } from "./report.js";
import { sendReportEmail } from "./email.js";

const CHECK_FUNCTIONS: Record<StoreName, (product: Product, page: Page) => Promise<PriceResult>> = {
  "Albert Heijn": checkAlbertHeijn,
  Jumbo: checkJumbo,
  Hoogvliet: checkHoogvliet,
  Lidl: checkLidl,
  Aldi: checkAldi,
  Makro: checkMakro,
};

function scheduledTimeIsValid(): boolean {
  const now = DateTime.now().setZone("Europe/Amsterdam");
  return now.weekday === 1 && now.hour === 8;
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
    console.log("Execução ignorada: fora de segunda-feira às 08:00 Europe/Amsterdam.");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results: PriceResult[] = [];

  try {
    for (const product of PRODUCTS) {
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

  const label = weekLabel();
  const htmlPath = generateHtml(PRODUCTS, results, label);
  const csvPath = generateCsv(PRODUCTS, results, label);
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
