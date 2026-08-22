// Supermercados da lista semanal de compras.
export const GROCERY_STORES = ["Albert Heijn", "Jumbo", "Hoogvliet", "Aldi", "Makro"] as const;

// Drogaria/bazar — não vendem mercearia fresca, só entram na busca avulsa de
// um produto (aba "Buscar Produto"), não na lista semanal de compras.
export const RETAIL_STORES = ["Etos", "Kruidvat", "Hema"] as const;

export const ALL_STORES = [...GROCERY_STORES, ...RETAIL_STORES] as const;
export type StoreName = (typeof ALL_STORES)[number];

// Jumbo e Aldi funcionam de verdade na automação; Albert Heijn, Hoogvliet e
// Makro bloqueiam acesso automatizado (ver scraper.ts) e sempre retornam
// "Verificação manual necessária" quando rodado sem intervenção humana.
// Lidl foi removida: a busca encontra produtos reais, mas a grade de preços
// nunca termina de carregar (testado várias vezes) — sem fonte confiável,
// não tem o que colocar na planilha.
export const ACTIVE_STORES: StoreName[] = [...GROCERY_STORES];
