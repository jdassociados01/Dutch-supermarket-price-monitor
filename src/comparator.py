from collections import defaultdict
from .models import PriceResult

def choose_cheapest(results: list[PriceResult]) -> dict[str, list[PriceResult]]:
    groups: dict[str, list[PriceResult]] = defaultdict(list)
    for result in results:
        if (
            result.normalized_price is not None
            and result.confidence in {"high", "medium"}
            and result.availability is not False
            and not result.error
        ):
            groups[result.product_id].append(result)
    winners: dict[str, list[PriceResult]] = {}
    for product_id, candidates in groups.items():
        minimum = min(item.normalized_price for item in candidates if item.normalized_price is not None)
        winners[product_id] = [item for item in candidates if item.normalized_price == minimum]
    return winners
