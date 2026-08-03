from __future__ import annotations
import argparse
import asyncio
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import yaml
from dotenv import load_dotenv
from .models import ProductConfig
from .history import append_history, save_latest
from .report import generate_html
from .email_sender import send_report

STORE_MODULES = {
    "Lidl": "lidl", "Aldi": "aldi", "Jumbo": "jumbo",
    "Albert Heijn": "albert_heijn", "Hoogvliet": "hoogvliet", "Makro": "makro"
}

def load_config():
    products_raw = yaml.safe_load(Path("config/products.yaml").read_text(encoding="utf-8"))["products"]
    stores_raw = yaml.safe_load(Path("config/stores.yaml").read_text(encoding="utf-8"))["stores"]
    return [ProductConfig(**p) for p in products_raw], [s["name"] for s in stores_raw]

def scheduled_time_is_valid() -> bool:
    now = datetime.now(ZoneInfo("Europe/Amsterdam"))
    return now.weekday() == 0 and now.hour == 8

async def collect(products, stores):
    results = []
    for store in stores:
        module_name = STORE_MODULES[store]
        module = __import__(f"src.stores.{module_name}", fromlist=["Connector"])
        connector = module.Connector()
        for product in products:
            results.append(await connector.search(product))
    return results

async def run(manual: bool, send_email: bool):
    load_dotenv()
    if not manual and not scheduled_time_is_valid():
        print("Execução ignorada: fora de segunda-feira às 08:00 Europe/Amsterdam.")
        return
    products, stores = load_config()
    results = await collect(products, stores)
    save_latest(results)
    append_history(results)
    report_path = generate_html(results, products, stores)
    print(f"Relatório criado: {report_path}")
    if send_email:
        send_report(report_path)
        print("E-mail enviado.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manual", action="store_true")
    parser.add_argument("--send-email", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.manual, args.send_email))
