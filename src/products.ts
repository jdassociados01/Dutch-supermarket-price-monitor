export interface Product {
  id: string;
  displayName: string;
  searchTerms: string[];
  comparisonUnit: "kg" | "unit";
  requiredBrand?: string;
}

export const PRODUCTS: Product[] = [
  { id: "ui", displayName: "Ui", searchTerms: ["ui", "uien"], comparisonUnit: "kg" },
  { id: "banaan", displayName: "Banaan", searchTerms: ["banaan", "bananen"], comparisonUnit: "kg" },
  { id: "appel", displayName: "Appel", searchTerms: ["appel", "appels"], comparisonUnit: "kg" },
  { id: "knoflook", displayName: "Knoflook", searchTerms: ["knoflook"], comparisonUnit: "unit" },
  { id: "jonge_kaas", displayName: "Jonge kaas", searchTerms: ["jonge kaas", "jong belegen kaas"], comparisonUnit: "kg" },
  {
    id: "witte_druiven",
    displayName: "Witte druiven",
    searchTerms: ["witte druiven", "pitloze witte druiven"],
    comparisonUnit: "kg",
  },
  { id: "mandarijn", displayName: "Mandarijn", searchTerms: ["mandarijn", "mandarijnen"], comparisonUnit: "kg" },
  {
    id: "lindahls_protein",
    displayName: "Lindahls Protein",
    searchTerms: ["Lindahls protein", "Lindahls kvarg"],
    comparisonUnit: "kg",
    requiredBrand: "Lindahls",
  },
  { id: "avocado", displayName: "Avocado", searchTerms: ["avocado", "avocado's"], comparisonUnit: "unit" },
  { id: "kipfilet", displayName: "Kipfilet", searchTerms: ["kipfilet"], comparisonUnit: "kg" },
  { id: "rundergehakt", displayName: "Rundergehakt", searchTerms: ["rundergehakt"], comparisonUnit: "kg" },
  { id: "paprika", displayName: "Paprika", searchTerms: ["paprika", "rode paprika", "paprika mix"], comparisonUnit: "kg" },
  { id: "tomaat", displayName: "Tomaat", searchTerms: ["tomaat", "tomaten"], comparisonUnit: "kg" },
  {
    id: "volkoren_tostibrood",
    displayName: "Volkoren tostibrood",
    searchTerms: ["volkoren tostibrood", "volkoren casino brood"],
    comparisonUnit: "kg",
  },
  {
    id: "melkunie_protein_pudding",
    displayName: "Melkunie Protein chocoladepudding",
    searchTerms: ["Melkunie Protein pudding chocolade", "Melkunie protein chocolade pudding"],
    comparisonUnit: "kg",
    requiredBrand: "Melkunie",
  },
];
