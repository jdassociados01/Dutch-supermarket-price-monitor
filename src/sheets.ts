import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { PRODUCTS } from "./products.js";
import type { Product } from "./products.js";
import { ALL_STORES } from "./stores.js";
import type { StoreName } from "./stores.js";
import type { PriceResult } from "./scraper.js";
import { cellText, findCheapestStores, perUnitValue } from "./report.js";

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
    const store = ALL_STORES.find((s) => normalize(s).replace(/[^a-z]/g, "") === norm);
    if (store) storeColumns[store] = colIndex;
    if (norm === "maisbarato") cheapestColumn = colIndex;
  });

  const productRows: SheetProductRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const rawName = rows[i]?.[0]?.trim();
    if (!rawName) continue;
    const rowNumber = i + 1;
    const existingValues: Partial<Record<StoreName, string>> = {};
    for (const store of ALL_STORES) {
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
// Plano de compra: em quais lojas (no máximo `maxStores`) comprar cada
// produto, minimizando o número de lojas visitadas. Testa todas as
// combinações de 1 e 2 lojas (poucas o bastante pra força bruta) e escolhe a
// que cobre mais produtos; empate é resolvido pelo menor custo total.
// ---------------------------------------------------------------------------

const MAX_STORES_TO_VISIT = 2;

function storeCombinations(stores: readonly StoreName[], size: number): StoreName[][] {
  if (size === 0) return [[]];
  if (stores.length < size) return [];
  const [first, ...rest] = stores;
  const withFirst = storeCombinations(rest, size - 1).map((combo) => [first!, ...combo]);
  const withoutFirst = storeCombinations(rest, size);
  return [...withFirst, ...withoutFirst];
}

interface ShoppingPlan {
  stores: StoreName[];
  assignment: Map<number, StoreName>;
}

/**
 * Valor comparável de um resultado para um produto: preço por kg/unidade
 * quando existe e bate com a unidade do produto (mesma regra do "Mais
 * barato" — nunca compara kg com unidade). Só cai para o preço bruto da
 * etiqueta quando NENHUM resultado da linha tem preço por unidade utilizável
 * — melhor um plano aproximado do que nenhum, mas prefere sempre a
 * comparação justa quando ela existe.
 */
function comparableValue(result: PriceResult, comparisonUnit: "kg" | "unit", useRawPriceFallback: boolean): number | null {
  const unitValue = perUnitValue(result);
  if (unitValue && unitValue.unit === comparisonUnit) return unitValue.value;
  if (useRawPriceFallback && result.price !== null) return result.price;
  return null;
}

function computeShoppingPlan(rows: SheetProductRow[], rowResultsByRow: Map<number, (PriceResult | undefined)[]>): ShoppingPlan {
  let candidateSets: StoreName[][] = [];
  for (let size = 1; size <= MAX_STORES_TO_VISIT; size++) {
    candidateSets = candidateSets.concat(storeCombinations(ALL_STORES, size));
  }

  // Por linha, só cai pro preço bruto (sem normalizar por kg/unidade) quando
  // nenhum resultado daquela linha tem um preço por unidade utilizável.
  const rawFallbackNeeded = new Map<number, boolean>();
  for (const row of rows) {
    const rowResults = rowResultsByRow.get(row.rowNumber) ?? [];
    const hasUsableUnitValue = rowResults.some(
      (r) => r && r.status === "ok" && perUnitValue(r)?.unit === row.product.comparisonUnit,
    );
    rawFallbackNeeded.set(row.rowNumber, !hasUsableUnitValue);
  }

  let best: { stores: StoreName[]; coverage: number; totalCost: number; assignment: Map<number, StoreName> } | null = null;

  for (const set of candidateSets) {
    let coverage = 0;
    let totalCost = 0;
    const assignment = new Map<number, StoreName>();

    for (const row of rows) {
      const rowResults = rowResultsByRow.get(row.rowNumber) ?? [];
      const useRawFallback = rawFallbackNeeded.get(row.rowNumber) ?? false;
      let bestStore: StoreName | null = null;
      let bestPrice = Infinity;
      for (const result of rowResults) {
        if (!result || result.status !== "ok") continue;
        if (!set.includes(result.store)) continue;
        const value = comparableValue(result, row.product.comparisonUnit, useRawFallback);
        if (value !== null && value < bestPrice) {
          bestPrice = value;
          bestStore = result.store;
        }
      }
      if (bestStore) {
        coverage++;
        totalCost += bestPrice;
        assignment.set(row.rowNumber, bestStore);
      }
    }

    if (!best || coverage > best.coverage || (coverage === best.coverage && totalCost < best.totalCost)) {
      best = { stores: set, coverage, totalCost, assignment };
    }
  }

  return { stores: best?.stores ?? [], assignment: best?.assignment ?? new Map() };
}

const PLAN_COLUMN_LETTER = "M";

export async function writeResultsToSheet(sheetInfo: SheetInfo, results: PriceResult[]): Promise<void> {
  const sheetsClient = await getSheetsClient();
  const byProductAndStore = new Map<string, PriceResult>();
  for (const r of results) byProductAndStore.set(`${r.productId}::${r.store}`, r);

  const data: { range: string; values: string[][] }[] = [];
  const rowResultsByRow = new Map<number, (PriceResult | undefined)[]>();

  for (const row of sheetInfo.rows) {
    const rowResults = ALL_STORES.map((store) => {
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

    for (const store of ALL_STORES) {
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

  const plan = computeShoppingPlan(sheetInfo.rows, rowResultsByRow);
  const headerRowNumber = sheetInfo.rows[0] ? sheetInfo.rows[0].rowNumber - 1 : 2;
  const summaryRowNumber = headerRowNumber - 1 > 0 ? headerRowNumber - 1 : headerRowNumber;

  data.push({ range: `'${SHEET_TAB}'!${PLAN_COLUMN_LETTER}${headerRowNumber}`, values: [["Onde comprar (plano de no máx. 2 mercados)"]] });

  if (plan.stores.length > 0) {
    const counts = new Map<StoreName, number>();
    for (const store of plan.assignment.values()) counts.set(store, (counts.get(store) ?? 0) + 1);
    const summary = plan.stores
      .filter((s) => (counts.get(s) ?? 0) > 0)
      .map((s) => `${s} (${counts.get(s)} produtos)`)
      .join(" + ");
    data.push({ range: `'${SHEET_TAB}'!${PLAN_COLUMN_LETTER}${summaryRowNumber}`, values: [[`Visite: ${summary}`]] });
  }

  for (const row of sheetInfo.rows) {
    const store = plan.assignment.get(row.rowNumber);
    data.push({
      range: `'${SHEET_TAB}'!${PLAN_COLUMN_LETTER}${row.rowNumber}`,
      values: [[store ?? "Não disponível nas lojas escolhidas"]],
    });
  }

  if (data.length === 0) return;

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}
