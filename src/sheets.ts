import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { PRODUCTS } from "./products.js";
import type { Product } from "./products.js";
import { GROCERY_STORES } from "./stores.js";
import type { StoreName } from "./stores.js";
import type { PriceResult } from "./scraper.js";
import { cellText, findCheapestStores } from "./report.js";

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID ?? "1xbN1irwkvAcVgGmn-k4mi0wRZMuNtoECn3ljULrv_Z0";
const SHEET_TAB = "Lista de Compras Semanais";
const CREDENTIALS_PATH = path.join("credentials", "google-service-account.json");

// ---------------------------------------------------------------------------
// Casamento tolerante a erro de digitação entre o nome digitado na planilha
// (ex.: "Jong kass", "Kip fillet") e os produtos cadastrados em products.ts,
// que têm os termos de busca corretos para cada loja. Produtos novos que não
// batem com nenhum cadastrado viram um produto "avulso" usando o texto da
// planilha como termo de busca — assim dá pra acrescentar produtos direto
// na planilha, sem editar código.
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

function tokensSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  const threshold = Math.max(1, Math.ceil(Math.max(a.length, b.length) * 0.3));
  return levenshtein(a, b) <= threshold;
}

function candidateTokens(product: Product): string[] {
  return tokenize([product.displayName, ...product.searchTerms].join(" "));
}

export function resolveSheetProduct(rawName: string, rowNumber: number): Product {
  const sheetTokens = tokenize(rawName);
  let best: Product | null = null;
  let bestScore = 0;

  for (const product of PRODUCTS) {
    const tokens = candidateTokens(product);
    const matched = sheetTokens.filter((st) => tokens.some((ct) => tokensSimilar(st, ct))).length;
    const score = sheetTokens.length > 0 ? matched / sheetTokens.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = product;
    }
  }

  if (best && bestScore >= 0.5) return best;

  const name = rawName.trim();
  return {
    id: `sheet_row_${rowNumber}`,
    displayName: name,
    searchTerms: [name],
    comparisonUnit: "kg",
  };
}

// ---------------------------------------------------------------------------
// Leitura/escrita na planilha
// ---------------------------------------------------------------------------

export interface SheetProductRow {
  rowNumber: number;
  rawName: string;
  product: Product;
  existingValues: Partial<Record<StoreName, string>>;
}

export interface SheetInfo {
  storeColumns: Partial<Record<StoreName, number>>;
  cheapestColumn: number;
  rows: SheetProductRow[];
}

function loadCredentials(): object {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Credencial do Google não encontrada. Configure a env var GOOGLE_SERVICE_ACCOUNT_JSON (conteúdo do arquivo) ou coloque o arquivo em ${CREDENTIALS_PATH}.`,
    );
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: loadCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function columnLetters(colIndex: number): string {
  let col = colIndex + 1;
  let letters = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    col = Math.floor((col - 1) / 26);
  }
  return letters;
}

export async function loadSheetProducts(): Promise<SheetInfo> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_TAB}'!A1:Z200`,
  });
  const rows = res.data.values ?? [];

  const headerRowIndex = rows.findIndex((r) => r[0]?.trim().toLowerCase() === "product");
  if (headerRowIndex === -1) {
    throw new Error(`Cabeçalho "Product" não encontrado na aba "${SHEET_TAB}".`);
  }
  const header = rows[headerRowIndex]!;

  const storeColumns: Partial<Record<StoreName, number>> = {};
  let cheapestColumn = -1;
  header.forEach((cell: string, colIndex: number) => {
    const norm = normalize(cell ?? "").replace(/[^a-z]/g, "");
    const store = GROCERY_STORES.find((s) => normalize(s).replace(/[^a-z]/g, "") === norm);
    if (store) storeColumns[store] = colIndex;
    if (norm === "maisbarato") cheapestColumn = colIndex;
  });

  const productRows: SheetProductRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const rawName = rows[i]?.[0]?.trim();
    if (!rawName) continue;
    const rowNumber = i + 1;
    const existingValues: Partial<Record<StoreName, string>> = {};
    for (const store of GROCERY_STORES) {
      const colIndex = storeColumns[store];
      if (colIndex === undefined) continue;
      const value = rows[i]?.[colIndex];
      if (value) existingValues[store] = String(value);
    }
    productRows.push({ rowNumber, rawName, product: resolveSheetProduct(rawName, rowNumber), existingValues });
  }

  return { storeColumns, cheapestColumn, rows: productRows };
}

/**
 * A automação nunca deve apagar um preço real já anotado na planilha (seja de
 * uma execução anterior com sucesso, seja digitado manualmente por alguém que
 * checou o site à mão). Só sobrescreve quando o resultado novo é "ok" (preço
 * de verdade encontrado agora) — "não encontrado"/"verificação manual" nunca
 * derrubam um valor que já existia.
 */
function shouldOverwrite(existingValue: string | undefined, result: PriceResult | undefined): boolean {
  if (!result) return false;
  if (result.status === "ok") return true;
  return !existingValue || !existingValue.includes("€");
}

/** Reconstrói um PriceResult mínimo a partir de um texto já salvo na célula,
 * só com o que a comparação de "mais barato" precisa (preço e €/kg-unidade). */
function parsePreservedCell(store: StoreName, text: string | undefined): PriceResult | undefined {
  if (!text || !text.includes("€")) return undefined;
  const priceMatch = /€\s*([\d.,]+)/.exec(text);
  if (!priceMatch) return undefined;
  const perUnitMatch = /€\s*[\d.,]+\s*per\s*(?:kilo|kg|stuk)/i.exec(text);
  return {
    store,
    productId: "",
    displayName: "",
    status: "ok",
    price: Number(priceMatch[1]!.replace(",", ".")),
    quantity: null,
    pricePerUnit: perUnitMatch ? perUnitMatch[0] : null,
    promotion: null,
    url: null,
  };
}

// ---------------------------------------------------------------------------
// Resumo por mercado: quantos produtos cada loja tem como a mais barata.
// Cada loja aparece uma única vez; só soma quando ela realmente é (ou
// empata como) a mais barata daquele produto específico.
// ---------------------------------------------------------------------------

function countCheapestByStore(rows: SheetProductRow[], rowResultsByRow: Map<number, (PriceResult | undefined)[]>): Map<StoreName, number> {
  const counts = new Map<StoreName, number>(GROCERY_STORES.map((s) => [s, 0]));
  for (const row of rows) {
    const rowResults = rowResultsByRow.get(row.rowNumber) ?? [];
    const cheapest = findCheapestStores(rowResults, row.product.comparisonUnit);
    for (const storeName of cheapest) {
      const store = storeName as StoreName;
      counts.set(store, (counts.get(store) ?? 0) + 1);
    }
  }
  return counts;
}

const SUMMARY_COLUMN_LETTER = "M";
const SUMMARY_CLEAR_ROWS = 40;

export async function writeResultsToSheet(sheetInfo: SheetInfo, results: PriceResult[]): Promise<void> {
  const sheetsClient = await getSheetsClient();
  const byProductAndStore = new Map<string, PriceResult>();
  for (const r of results) byProductAndStore.set(`${r.productId}::${r.store}`, r);

  const data: { range: string; values: string[][] }[] = [];
  const rowResultsByRow = new Map<number, (PriceResult | undefined)[]>();

  for (const row of sheetInfo.rows) {
    const rowResults = GROCERY_STORES.map((store) => {
      const fresh = byProductAndStore.get(`${row.product.id}::${store}`);
      // Se o valor da planilha vai ser preservado (não sobrescrito), usa esse
      // valor preservado na comparação de mais barato também — senão a coluna
      // "Mais barato" ignoraria um preço manual que continua lá.
      if (!shouldOverwrite(row.existingValues[store], fresh)) {
        return parsePreservedCell(store, row.existingValues[store]) ?? fresh;
      }
      return fresh;
    });
    rowResultsByRow.set(row.rowNumber, rowResults);

    for (const store of GROCERY_STORES) {
      const colIndex = sheetInfo.storeColumns[store];
      if (colIndex === undefined) continue;
      const result = byProductAndStore.get(`${row.product.id}::${store}`);
      if (!shouldOverwrite(row.existingValues[store], result)) continue;
      data.push({
        range: `'${SHEET_TAB}'!${columnLetters(colIndex)}${row.rowNumber}`,
        values: [[cellText(result)]],
      });
    }

    if (sheetInfo.cheapestColumn >= 0) {
      const cheapest = findCheapestStores(rowResults, row.product.comparisonUnit);
      const label = cheapest.size > 0 ? [...cheapest].join(", ") : "Sem vencedor claro";
      data.push({
        range: `'${SHEET_TAB}'!${columnLetters(sheetInfo.cheapestColumn)}${row.rowNumber}`,
        values: [[label]],
      });
    }
  }

  // Limpa a coluna M inteira antes de escrever o resumo novo, pra não sobrar
  // lixo de versões antigas (ex.: o plano por linha que existia antes).
  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_TAB}'!${SUMMARY_COLUMN_LETTER}1:${SUMMARY_COLUMN_LETTER}${SUMMARY_CLEAR_ROWS}`,
  });

  const counts = countCheapestByStore(sheetInfo.rows, rowResultsByRow);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  data.push({ range: `'${SHEET_TAB}'!${SUMMARY_COLUMN_LETTER}1`, values: [["Resumo: produtos mais baratos por mercado"]] });
  ranked.forEach(([store, count], i) => {
    data.push({ range: `'${SHEET_TAB}'!${SUMMARY_COLUMN_LETTER}${i + 2}`, values: [[`${store}: ${count}`]] });
  });

  if (data.length === 0) return;

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

// ---------------------------------------------------------------------------
// Aba "Buscar Produto": pesquisa avulsa de um único produto em todas as 8
// lojas (mercearia + Etos/Kruidvat/Hema), disparada pelo botão da planilha.
// ---------------------------------------------------------------------------

const SEARCH_TAB = "Buscar Produto";
const SEARCH_QUERY_CELL = `'${SEARCH_TAB}'!B2`;
const SEARCH_RESULTS_START_ROW = 5;
const SEARCH_RESULTS_CLEAR_ROWS = 30;

export async function readSearchQuery(): Promise<string | null> {
  const sheetsClient = await getSheetsClient();
  const res = await sheetsClient.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: SEARCH_QUERY_CELL });
  const value = res.data.values?.[0]?.[0];
  return value ? String(value).trim() : null;
}

export async function writeSearchResults(productName: string, results: PriceResult[]): Promise<void> {
  const sheetsClient = await getSheetsClient();

  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SEARCH_TAB}'!A${SEARCH_RESULTS_START_ROW}:B${SEARCH_RESULTS_START_ROW + SEARCH_RESULTS_CLEAR_ROWS}`,
  });

  const data: { range: string; values: string[][] }[] = [
    { range: `'${SEARCH_TAB}'!D1`, values: [[`Última busca: "${productName}" — ${new Date().toLocaleString("pt-BR", { timeZone: "Europe/Amsterdam" })}`]] },
  ];

  results.forEach((result, i) => {
    const row = SEARCH_RESULTS_START_ROW + i;
    data.push({ range: `'${SEARCH_TAB}'!A${row}`, values: [[result.store, cellText(result)]] });
  });

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}
