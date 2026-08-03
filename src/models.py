from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field

Confidence = Literal["high", "medium", "low"]

class ProductConfig(BaseModel):
    id: str
    display_name: str
    search_terms: list[str]
    comparison_unit: str
    required_brand: str | None = None

class PriceResult(BaseModel):
    store: str
    product_id: str
    display_product_name: str
    matched_product_name: str | None = None
    brand: str | None = None
    price: Decimal | None = None
    currency: str = "EUR"
    original_price: Decimal | None = None
    package_quantity: Decimal | None = None
    package_unit: str | None = None
    normalized_price: Decimal | None = None
    normalized_unit: str | None = None
    promotion: bool = False
    promotion_conditions: str | None = None
    loyalty_card_required: bool = False
    vat_included: bool = True
    availability: bool | None = None
    product_url: str | None = None
    source_url: str | None = None
    confidence: Confidence = "low"
    checked_at: datetime = Field(default_factory=datetime.now)
    error: str | None = None
