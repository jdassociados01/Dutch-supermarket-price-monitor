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
// Lidl, Aldi, Makro — ainda não implementados (fase 2, depois que Albert
// Heijn/Jumbo/Hoogvliet estiverem funcionando). Retornam sempre verificação
// manual até serem implementados de verdade.
// ---------------------------------------------------------------------------
export async function checkLidl(product: Product, _page: Page): Promise<PriceResult> {
  return manualCheckNeeded("Lidl", product);
}

export async function checkAldi(product: Product, _page: Page): Promise<PriceResult> {
  return manualCheckNeeded("Aldi", product);
}

export async function checkMakro(product: Product, _page: Page): Promise<PriceResult> {
  return manualCheckNeeded("Makro", product);
}
