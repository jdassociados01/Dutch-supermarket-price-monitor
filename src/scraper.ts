import type { Page } from "playwright";
import type { Product } from "./products.js";
import type { StoreName } from "./stores.js";

export interface PriceResult {
  store: StoreName;
  productId: string;
  displayName: string;
  status: "ok" | "not_found" | "manual_check_needed";
  price: number | null;
  quantity: string | null;
  pricePerUnit: string | null;
  promotion: string | null;
  url: string | null;
}

const NAV_TIMEOUT_MS = 45000;

function notFound(store: StoreName, product: Product): PriceResult {
  return {
    store,
    productId: product.id,
    displayName: product.displayName,
    status: "not_found",
    price: null,
    quantity: null,
    pricePerUnit: null,
    promotion: null,
    url: null,
  };
}

function manualCheckNeeded(store: StoreName, product: Product): PriceResult {
  return {
    store,
    productId: product.id,
    displayName: product.displayName,
    status: "manual_check_needed",
    price: null,
    quantity: null,
    pricePerUnit: null,
    promotion: null,
    url: null,
  };
}

function parseEuro(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = /(\d+[.,]\d{2})/.exec(text);
  if (!match) return null;
  return Number(match[1]!.replace(",", "."));
}

function matchesSearchTerm(name: string, product: Product): boolean {
  const normalized = name.toLowerCase();
  if (product.requiredBrand && !normalized.includes(product.requiredBrand.toLowerCase())) {
    return false;
  }
  // Exige todas as palavras do termo (não só a primeira) — evitar falsos
  // positivos como "Witte druiven" casando com "Tintelfris Witte druif ...".
  return product.searchTerms.some((term) => {
    const words = term.toLowerCase().split(/\s+/).filter(Boolean);
    return words.every((word) => normalized.includes(word));
  });
}

// ---------------------------------------------------------------------------
// Albert Heijn
// Confirmado nesta sessão: a AH usa Akamai Bot Manager e bloqueia (HTTP 403)
// o acesso automatizado via Playwright, mesmo com um browser real (não é só
// bloqueio de curl). A navegação/detecção de bloqueio abaixo é real e testada.
// O parsing do resultado (para quando o bloqueio não ocorrer, ex.: rodando de
// outra rede/máquina) segue a estrutura real observada manualmente no site,
// mas não pôde ser exercitado de ponta a ponta nesta sessão por causa do
// bloqueio — trate como não verificado até rodar com sucesso.
// ---------------------------------------------------------------------------
export async function checkAlbertHeijn(product: Product, page: Page): Promise<PriceResult> {
  const term = encodeURIComponent(product.searchTerms[0]!);
  const url = `https://www.ah.nl/zoeken?query=${term}`;

  let response;
  try {
    response = await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });
  } catch {
    return manualCheckNeeded("Albert Heijn", product);
  }
  if (!response || response.status() >= 400) {
    return manualCheckNeeded("Albert Heijn", product);
  }

  const links = page.locator('a[href*="/producten/product/"]');
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    const text = (await link.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (!text || !matchesSearchTerm(text, product)) continue;

    const href = await link.getAttribute("href");
    const priceMatch = /€\s*([\d.,]+)/.exec(text);
    const promoMatch = /(\d+\s*voor\s*[\d.,]+|\d+\+\d+\s*gratis|bonus)/i.exec(text);

    return {
      store: "Albert Heijn",
      productId: product.id,
      displayName: product.displayName,
      status: "ok",
      price: parseEuro(priceMatch?.[0]),
      quantity: null,
      pricePerUnit: null,
      promotion: promoMatch ? promoMatch[0] : null,
      url: href ? new URL(href, "https://www.ah.nl").toString() : url,
    };
  }
  return notFound("Albert Heijn", product);
}

// ---------------------------------------------------------------------------
// Jumbo
// Testado nesta sessão com Playwright real: funciona (sem bloqueio de bot).
// A busca disallowed no robots.txt é a mesma usada aqui — para uso pessoal,
// baixo volume (uma vez por semana), aceito conforme instrução do usuário.
// ---------------------------------------------------------------------------
export async function checkJumbo(product: Product, page: Page): Promise<PriceResult> {
  const term = encodeURIComponent(product.searchTerms[0]!);
  const url = `https://www.jumbo.com/producten/?searchType=keyword&searchTerms=${term}`;

  let response;
  try {
    response = await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });
  } catch {
    return manualCheckNeeded("Jumbo", product);
  }
  if (!response || response.status() >= 400) {
    return manualCheckNeeded("Jumbo", product);
  }

  const cards = page.locator("article.product-container");
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const isSponsored = (await card.locator(".subtitle").innerText().catch(() => "")).toLowerCase().includes("gesponsord");
    if (isSponsored) continue;

    const name = (await card.locator(".name").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (!name || !matchesSearchTerm(name, product)) continue;

    const priceText = await card.locator(".current-price .screenreader-only").innerText().catch(() => "");
    const promoText = await card.locator(".promotions").innerText().catch(() => "");
    const perUnitText = await card.locator(".price-per-unit .screenreader-only").innerText().catch(() => "");
    const href = await card.locator("a.link, a").first().getAttribute("href").catch(() => null);

    // Produtos de kg (fruta/legume/carne/queijo) nunca são vendidos por litro.
    // Evita casar com bebidas com sabor igual ao nome da fruta (ex.: "Dubbelfrisss
    // Witte druiven" é uma água aromatizada, não uva de verdade).
    if (product.comparisonUnit === "kg" && /per liter|\/\s*l\b/i.test(perUnitText)) continue;

    return {
      store: "Jumbo",
      productId: product.id,
      displayName: product.displayName,
      status: "ok",
      price: parseEuro(priceText),
      quantity: null,
      pricePerUnit: perUnitText.trim() || null,
      promotion: promoText.trim() || null,
      url: href ? new URL(href, "https://www.jumbo.com").toString() : url,
    };
  }
  return notFound("Jumbo", product);
}

// ---------------------------------------------------------------------------
// Hoogvliet
// Confirmado nesta sessão: a Hoogvliet usa Incapsula (Imperva) e bloqueia
// (HTTP 403) o acesso automatizado via Playwright, mesmo com browser real.
// A URL de busca abaixo foi confirmada real (navegação manual). O parsing
// segue a estrutura real observada, mas não verificado de ponta a ponta
// por causa do bloqueio — mesma ressalva da Albert Heijn.
// ---------------------------------------------------------------------------
export async function checkHoogvliet(product: Product, page: Page): Promise<PriceResult> {
  const term = encodeURIComponent(product.searchTerms[0]!);
  const url = `https://www.hoogvliet.com/INTERSHOP/web/WFS/org-webshop-Site/nl_NL/-/EUR/ViewTWParametricSearch-SimpleOfferSearch?SearchTerm=${term}&SelectedSearchResult=SFProductSearch`;

  let response;
  try {
    response = await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });
  } catch {
    return manualCheckNeeded("Hoogvliet", product);
  }
  if (!response || response.status() >= 400) {
    return manualCheckNeeded("Hoogvliet", product);
  }

  const cards = page.locator(".product-tile");
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const name = (await card.locator(".product-title").innerText().catch(() => "")).trim();
    if (!name || !matchesSearchTerm(name, product)) continue;

    const priceText = await card.locator(".kor-product-sale-price").first().innerText().catch(() => "");
    const quantityText = await card.locator(".ratio-base-packing-unit").innerText().catch(() => "");
    const href = await card.locator(".product-title").getAttribute("href").catch(() => null);

    return {
      store: "Hoogvliet",
      productId: product.id,
      displayName: product.displayName,
      status: "ok",
      price: parseEuro(priceText.replace(/\s+/g, "")),
      quantity: quantityText.trim() || null,
      pricePerUnit: null,
      promotion: null,
      url: href ?? url,
    };
  }
  // Confirmado nesta sessão: a Incapsula às vezes deixa passar uma página real
  // (200, HTML completo) mas com a busca esvaziada ("0 producten found"),
  // mesmo para termos que certamente existem no catálogo (ex.: "appel"). Como
  // não dá para distinguir isso de um "não encontrado" de verdade, tratamos
  // como bloqueio em vez de arriscar um falso "não encontrado".
  return manualCheckNeeded("Hoogvliet", product);
}

// ---------------------------------------------------------------------------
// Lidl foi removida (ver stores.ts): a busca em lidl.nl encontra produtos de
// verdade (ex.: 48 resultados reais para "kipfilet"), mas a grade de preços
// nunca sai do estado de carregamento — testado várias vezes, mesmo com
// navegação real e espera. Sem fonte confiável, não há conector aqui.
// ---------------------------------------------------------------------------
// Aldi
// Testado nesta sessão com Playwright real: funciona, sem bloqueio de bot.
// A busca retorna dois grupos de resultados ("Webshop" genérico, cheio de
// produtos não-alimentares que só coincidem por palavra, e o catálogo real
// da loja); usamos somente os cards `.product-tile` do catálogo da loja.
// ---------------------------------------------------------------------------
export async function checkAldi(product: Product, page: Page): Promise<PriceResult> {
  const term = encodeURIComponent(product.searchTerms[0]!);
  const url = `https://www.aldi.nl/zoeken.html?searchbox=${term}&query=${term}`;

  let response;
  try {
    response = await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "networkidle" });
  } catch {
    return manualCheckNeeded("Aldi", product);
  }
  if (!response || response.status() >= 400) {
    return manualCheckNeeded("Aldi", product);
  }

  // Timeout curto nas checagens por card: alguns tiles não têm preço (ex.:
  // itens sem estoque) e o timeout padrão do Playwright (30s) por elemento
  // ausente deixaria a busca extremamente lenta se esperássemos em cada um.
  const shortTimeout = { timeout: 3000 };

  const cards = page.locator(".product-tile");
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const name = (await card.locator('h2[class*="product-tile__content__upper"]').first().innerText(shortTimeout).catch(() => "")).trim();
    if (!name || !matchesSearchTerm(name, product)) continue;

    const quantityRaw = (await card.locator('[class*="tag__info"]').first().innerText(shortTimeout).catch(() => "")).trim();

    // Produtos de kg nunca são vendidos por litro (mesma regra do Jumbo).
    if (product.comparisonUnit === "kg" && /\bl\b|liter/i.test(quantityRaw)) continue;

    const priceRaw = await card.locator('[class*="tag__price"]').first().innerText(shortTimeout).catch(() => "");
    const priceMatches = [...priceRaw.matchAll(/\d+[.,]\d{2}/g)].map((m) => Number(m[0].replace(",", ".")));
    const price = priceMatches[0] ?? null;
    if (price === null) continue;

    const href = await card.locator('a[class*="product-tile__action"]').first().getAttribute("href", shortTimeout).catch(() => null);

    let promotion: string | null = null;
    const voorMatch = /(\d+)\s*voor/i.exec(priceRaw);
    if (voorMatch) {
      promotion = `${voorMatch[1]} voor €${price.toFixed(2)}`;
    } else if (/op=op/i.test(priceRaw)) {
      promotion = "OP=OP";
    }

    const isPerUnit = /^per\s/i.test(quantityRaw);
    // A Aldi às vezes mostra uma segunda linha com o preço por kg já
    // calculado (ex.: "1.5 kg\nkg = 1.30") — reaproveita no mesmo formato
    // do Jumbo para entrar na comparação de mais barato do report.ts.
    const kgHintMatch = /kg\s*=\s*([\d.,]+)/i.exec(quantityRaw);
    const packageSize = quantityRaw.split("\n")[0]!.trim();

    return {
      store: "Aldi",
      productId: product.id,
      displayName: product.displayName,
      status: "ok",
      price,
      quantity: isPerUnit ? null : packageSize || null,
      pricePerUnit: isPerUnit
        ? `€${price.toFixed(2)} ${quantityRaw}`
        : kgHintMatch
          ? `€${kgHintMatch[1]} per kilo`
          : null,
      promotion,
      url: href ? new URL(href, "https://www.aldi.nl").toString() : url,
    };
  }
  return notFound("Aldi", product);
}

// ---------------------------------------------------------------------------
// Makro
// Confirmado nesta sessão: bloqueia acesso automatizado (HTTP 403, página
// "ARE YOU LOST?") mesmo via Playwright real — mesmo padrão de bloqueio da
// Albert Heijn e da Hoogvliet. A busca real (via navegação manual) mostrou
// preços de "Makro Amsterdam" misturados com resultados irrelevantes de um
// marketplace geral, mas o bloqueio nunca deixou inspecionar a estrutura da
// página para montar um parser confiável. Sem contornar, então verificação
// manual até isso mudar.
// ---------------------------------------------------------------------------
export async function checkMakro(product: Product, _page: Page): Promise<PriceResult> {
  return manualCheckNeeded("Makro", product);
}

// ---------------------------------------------------------------------------
// Etos, Kruidvat, Hema — drogaria/bazar, não supermercado. Usados só na busca
// avulsa de um produto (aba "Buscar Produto"), não na lista semanal de
// mercearia: nenhum dos três vende fruta/legume/carne/queijo frescos
// (testado nesta sessão — "appel" só retorna torta/suco/vinagre de maçã,
// "kipfilet" não existe na Etos). Úteis pra produtos de beleza/casa/farmácia
// que o usuário adicionar na busca avulsa.
// ---------------------------------------------------------------------------

// Etos: confirmado nesta sessão que bloqueia (mesmo grupo Ahold Delhaize da
// Albert Heijn, mesmo padrão de erro "Oeps! We kunnen Etos.nl niet bereiken").
// A detecção de bloqueio é real; o parsing abaixo não foi exercitado com
// resultado de verdade (só vi uma busca sem resultados antes do bloqueio) —
// mesma ressalva da Albert Heijn: trate como não verificado.
export async function checkEtos(product: Product, page: Page): Promise<PriceResult> {
  const term = encodeURIComponent(product.searchTerms[0]!);
  const url = `https://www.etos.nl/search?q=${term}`;

  let response;
  try {
    response = await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });
  } catch {
    return manualCheckNeeded("Etos", product);
  }
  if (!response || response.status() >= 400) {
    return manualCheckNeeded("Etos", product);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (/we kunnen etos\.nl/i.test(bodyText)) {
    return manualCheckNeeded("Etos", product);
  }
  if (/geen resultaten voor/i.test(bodyText)) {
    return notFound("Etos", product);
  }

  const cards = page.locator('[class*="product-tile"], [class*="product-grid"] li');
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const name = (await card.innerText().catch(() => "")).split("\n")[0]?.trim() ?? "";
    if (!name || !matchesSearchTerm(name, product)) continue;

    const text = (await card.innerText().catch(() => "")).replace(/\s+/g, " ");
    const priceMatch = /€\s*([\d.,]+)/.exec(text);
    const href = await card.locator("a").first().getAttribute("href").catch(() => null);

    return {
      store: "Etos",
      productId: product.id,
      displayName: product.displayName,
      status: "ok",
      price: parseEuro(priceMatch?.[0]),
      quantity: null,
      pricePerUnit: null,
      promotion: /1\s*\+\s*1\s*gratis/i.test(text) ? "1+1 gratis" : null,
      url: href ? new URL(href, "https://www.etos.nl").toString() : url,
    };
  }
  return notFound("Etos", product);
}

// Kruidvat: testado nesta sessão com Playwright real, sem bloqueio de bot.
// Estrutura confirmada: cards `.product-list-item`.
export async function checkKruidvat(product: Product, page: Page): Promise<PriceResult> {
  const term = encodeURIComponent(product.searchTerms[0]!);
  const url = `https://www.kruidvat.nl/search/${term}`;

  let response;
  try {
    response = await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });
  } catch {
    return manualCheckNeeded("Kruidvat", product);
  }
  if (!response || response.status() >= 400) {
    return manualCheckNeeded("Kruidvat", product);
  }

  const cards = page.locator(".product-list-item");
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const name = (await card.locator(".product-list-item__name").innerText().catch(() => "")).trim();
    if (!name || !matchesSearchTerm(name, product)) continue;

    const priceText = await card.locator(".product-list-item__price").first().innerText().catch(() => "");
    const quantityText = await card.locator(".product-list-item__short-description").innerText().catch(() => "");
    const promoText = await card.locator(".promotion-roundel").innerText().catch(() => "");
    const href = await card.locator("a.product-list-item__link").first().getAttribute("href").catch(() => null);

    return {
      store: "Kruidvat",
      productId: product.id,
      displayName: product.displayName,
      status: "ok",
      price: parseEuro(priceText),
      quantity: quantityText.trim() || null,
      pricePerUnit: null,
      promotion: promoText.trim() || null,
      url: href ? new URL(href, "https://www.kruidvat.nl").toString() : url,
    };
  }
  return notFound("Kruidvat", product);
}

// Hema: testado nesta sessão com Playwright real, sem bloqueio de bot.
// Estrutura confirmada: cards `.js-product-tile`, com preço por unidade já
// calculado em `.price-per-item-info` quando aplicável.
export async function checkHema(product: Product, page: Page): Promise<PriceResult> {
  const term = encodeURIComponent(product.searchTerms[0]!);
  const url = `https://www.hema.nl/search?lang=nl_NL&q=${term}`;

  let response;
  try {
    response = await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });
  } catch {
    return manualCheckNeeded("Hema", product);
  }
  if (!response || response.status() >= 400) {
    return manualCheckNeeded("Hema", product);
  }

  const cards = page.locator(".js-product-tile");
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const name = (await card.locator(".js-product-link").first().innerText().catch(() => "")).trim();
    if (!name || !matchesSearchTerm(name, product)) continue;

    const priceText = await card.locator(".price.discounted, .product-price .price").first().innerText().catch(() => "");
    const perUnitText = await card.locator(".price-per-item-info").innerText().catch(() => "");
    const href = await card.locator(".js-product-link").first().getAttribute("href").catch(() => null);

    return {
      store: "Hema",
      productId: product.id,
      displayName: product.displayName,
      status: "ok",
      price: parseEuro(priceText),
      quantity: null,
      pricePerUnit: perUnitText.trim() || null,
      promotion: null,
      url: href ? new URL(href, "https://www.hema.nl").toString() : url,
    };
  }
  return notFound("Hema", product);
}

export type CheckFunction = (product: Product, page: Page) => Promise<PriceResult>;

/** Todas as 8 lojas conhecidas. A rotina semanal só usa GROCERY_STORES (ver
 * stores.ts); a busca avulsa de um produto usa o mapa inteiro. */
export const CHECK_FUNCTIONS: Record<StoreName, CheckFunction> = {
  "Albert Heijn": checkAlbertHeijn,
  Jumbo: checkJumbo,
  Hoogvliet: checkHoogvliet,
  Aldi: checkAldi,
  Makro: checkMakro,
  Etos: checkEtos,
  Kruidvat: checkKruidvat,
  Hema: checkHema,
};
