export const ALL_STORES = ["Albert Heijn", "Jumbo", "Hoogvliet", "Lidl", "Aldi", "Makro"] as const;
export type StoreName = (typeof ALL_STORES)[number];

// Fase 1 da prova de conceito. Lidl, Aldi e Makro entram depois que estas três
// estiverem funcionando de verdade (ver README.md).
export const ACTIVE_STORES: StoreName[] = ["Albert Heijn", "Jumbo", "Hoogvliet"];
