from decimal import Decimal
from src.normalizer import normalize_price, add_vat

def test_grams_to_kg():
    assert normalize_price(Decimal("2.50"), Decimal("500"), "g", "kg") == Decimal("5.00")

def test_units():
    assert normalize_price(Decimal("3.00"), Decimal("3"), "unit", "unit") == Decimal("1.00")

def test_vat():
    assert add_vat(Decimal("10.00"), Decimal("0.09")) == Decimal("10.90")
