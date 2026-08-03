from .base import StoreConnector
from ..models import ProductConfig, PriceResult

class Connector(StoreConnector):
    name = "lidl"
    async def search(self, product: ProductConfig) -> PriceResult:
        return PriceResult(
            store=self.name,
            product_id=product.id,
            display_product_name=product.display_name,
            error="Conector ainda precisa ser validado contra a fonte oficial.",
            confidence="low",
        )
