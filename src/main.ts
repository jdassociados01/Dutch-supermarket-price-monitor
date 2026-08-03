import "dotenv/config";
import fs from "node:fs";
import yaml from "js-yaml";
import { DateTime } from "luxon";
import { ProductConfigSchema } from "./models.js";
import type { ProductConfig, PriceResult } from "./models.js";
import { saveLatest, appendHistory } from "./history.js";
import { generateHtml } from "./report.js";
import { sendReport } from "./emailSender.js";
import type { StoreConnector } from "./stores/base.js";
import { connector as lidl } from "./stores/lidl.js";
import { connector as aldi } from "./stores/aldi.js";
import { connector as jumbo } from "./stores/jumbo.js";
import { connector as albertHeijn } from "./stores/albertHeijn.js";
import { connector as hoogvliet } from "./stores/hoogvliet.js";
import { connector as makro } from "./stores/makro.js";

const STORE_CONNECTORS: Record<string, StoreConnector> = {
  Lidl: lidl,
  Aldi: aldi,
  Jumbo: jumbo,
  "Albert Heijn": albertHeijn,
  Hoogvliet: hoogvliet,
  Makro: makro,
};

function loadConfig(): { products: ProductConfig[]; stores: string[] } {
  const productsRaw = yaml.load(fs.readFileSync("config/products.yaml", "utf-8")) as { products: unknown[] };
  const storesRaw = yaml.load(fs.readFileSync("config/stores.yaml", "utf-8")) as { stores: { name: string }[] };
  const products = productsRaw.products.map((p) => ProductConfigSchema.parse(p));
  const stores = storesRaw.stores.map((s) => s.name);
  return { products, stores };
}

function scheduledTimeIsValid(): boolean {
  const now = DateTime.now().setZone("Europe/Amsterdam");
  return now.weekday === 1 && now.hour === 8;
}

async function collect(products: ProductConfig[], stores: string[]): Promise<PriceResult[]> {
  const results: PriceResult[] = [];
  for (const store of stores) {
    const connector = STORE_CONNECTORS[store];
    if (!connector) throw new Error(`Nenhum conector configurado para a loja: ${store}`);
    for (const product of products) {
      const result = await connector.search(product);
      // O relatório casa resultados pelo nome de exibição em stores.yaml,
      // não pelo slug interno do conector — normaliza aqui para nunca dessincronizar.
      results.push({ ...result, store });
    }
  }
  return results;
}

async function run(manual: boolean, sendEmail: boolean): Promise<void> {
  if (!manual && !scheduledTimeIsValid()) {
    console.log("Execução ignorada: fora de segunda-feira às 08:00 Europe/Amsterdam.");
    return;
  }
  const { products, stores } = loadConfig();
  const results = await collect(products, stores);
  saveLatest(results);
  appendHistory(results);
  const reportPath = generateHtml(results, products, stores);
  console.log(`Relatório criado: ${reportPath}`);
  if (sendEmail) {
    await sendReport(reportPath);
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
