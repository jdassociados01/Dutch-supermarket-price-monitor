from abc import ABC, abstractmethod
from ..models import ProductConfig, PriceResult

class StoreConnector(ABC):
    name: str
    @abstractmethod
    async def search(self, product: ProductConfig) -> PriceResult:
        raise NotImplementedError
