export const ALL_STORES = ["Albert Heijn", "Jumbo", "Hoogvliet", "Lidl", "Aldi", "Makro"] as const;
export type StoreName = (typeof ALL_STORES)[number];

// Todas as 6 lojas estão ligadas. Jumbo e Aldi funcionam de verdade; Albert
// Heijn, Hoogvliet e Makro bloqueiam acesso automatizado (ver scraper.ts) e
// sempre retornam "Verificação manual necessária"; Lidl não tem catálogo de
// mercearia pesquisável.
export const ACTIVE_STORES: StoreName[] = ["Albert Heijn", "Jumbo", "Hoogvliet", "Lidl", "Aldi", "Makro"];
