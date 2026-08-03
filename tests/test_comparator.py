from decimal import Decimal
from src.models import PriceResult
from src.comparator import choose_cheapest

def item(store, value):
    return PriceResult(store=store, product_id="banana", display_product_name="Banaan", price=value, normalized_price=value, normalized_unit="kg", confidence="high", availability=True)

def test_cheapest_and_tie():
    winners = choose_cheapest([item("A", Decimal("2.00")), item("B", Decimal("1.50")), item("C", Decimal("1.50"))])
    assert {x.store for x in winners["banana"]} == {"B", "C"}
