from decimal import Decimal

UNIT_TO_KG = {
    "g": Decimal("0.001"),
    "kg": Decimal("1"),
}
UNIT_TO_L = {
    "ml": Decimal("0.001"),
    "cl": Decimal("0.01"),
    "l": Decimal("1"),
}

def normalize_price(price: Decimal, quantity: Decimal, unit: str, target: str) -> Decimal:
    unit = unit.lower()
    target = target.lower()
    if quantity <= 0:
        raise ValueError("Quantity must be positive")
    if target == "kg" and unit in UNIT_TO_KG:
        return (price / (quantity * UNIT_TO_KG[unit])).quantize(Decimal("0.01"))
    if target == "l" and unit in UNIT_TO_L:
        return (price / (quantity * UNIT_TO_L[unit])).quantize(Decimal("0.01"))
    if target == "unit" and unit in {"unit", "piece", "stuk"}:
        return (price / quantity).quantize(Decimal("0.01"))
    raise ValueError(f"Incompatible units: {unit} -> {target}")

def add_vat(net_price: Decimal, vat_rate: Decimal) -> Decimal:
    return (net_price * (Decimal("1") + vat_rate)).quantize(Decimal("0.01"))
