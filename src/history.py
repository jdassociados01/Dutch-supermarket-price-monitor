import csv
import json
from pathlib import Path
from .models import PriceResult

DATA_DIR = Path("data")

def save_latest(results: list[PriceResult]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    payload = [r.model_dump(mode="json") for r in results]
    (DATA_DIR / "latest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

def append_history(results: list[PriceResult]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    path = DATA_DIR / "history.csv"
    fields = ["checked_at", "product_id", "display_product_name", "store", "price", "normalized_price", "normalized_unit", "promotion", "confidence", "source_url", "error"]
    exists = path.exists()
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        if not exists:
            writer.writeheader()
        for r in results:
            writer.writerow({key: getattr(r, key) for key in fields})
