import type { PriceResult } from "./models.js";

export function chooseCheapest(results: PriceResult[]): Record<string, PriceResult[]> {
  const groups = new Map<string, PriceResult[]>();
  for (const result of results) {
    if (
      result.normalized_price !== null &&
      (result.confidence === "high" || result.confidence === "medium") &&
      result.availability !== false &&
      !result.error
    ) {
      const bucket = groups.get(result.product_id) ?? [];
      bucket.push(result);
      groups.set(result.product_id, bucket);
    }
  }

  const winners: Record<string, PriceResult[]> = {};
  for (const [productId, candidates] of groups) {
    const minimum = candidates.reduce(
      (min, item) => (item.normalized_price!.lt(min) ? item.normalized_price! : min),
      candidates[0]!.normalized_price!,
    );
    winners[productId] = candidates.filter((item) => item.normalized_price!.eq(minimum));
  }
  return winners;
}
