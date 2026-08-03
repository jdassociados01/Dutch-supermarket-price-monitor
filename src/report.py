from datetime import date
from pathlib import Path
from jinja2 import Template
from .models import PriceResult
from .comparator import choose_cheapest

HTML_TEMPLATE = Template("""
<!doctype html><html><head><meta charset='utf-8'><style>
body{font-family:Arial,sans-serif;color:#17233c}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;vertical-align:top}th{background:#f4f4f4}.winner{background:#dff5e3;font-weight:bold}.error{color:#9b1c1c;font-size:12px}
</style></head><body>
<h1>Preços dos supermercados – semana de {{ today }}</h1>
<table><thead><tr><th>Produto</th>{% for store in stores %}<th>{{ store }}</th>{% endfor %}<th>Mais barato</th></tr></thead><tbody>
{% for product in products %}<tr><td>{{ product.display_name }}</td>
{% for store in stores %}{% set item = matrix.get((product.id, store)) %}<td class="{% if item and item in winners.get(product.id, []) %}winner{% endif %}">{% if item and not item.error %}€{{ item.price }}{% if item.normalized_price %}<br>€{{ item.normalized_price }}/{{ item.normalized_unit }}{% endif %}{% if item.promotion %}<br>Promoção{% endif %}{% if item.source_url %}<br><a href="{{ item.source_url }}">fonte</a>{% endif %}{% else %}<span class='error'>{{ item.error if item else 'Não encontrado' }}</span>{% endif %}</td>{% endfor %}
<td>{% for win in winners.get(product.id, []) %}{{ win.store }} – €{{ win.normalized_price }}/{{ win.normalized_unit }}{% if not loop.last %}<br>{% endif %}{% else %}Sem preço confirmado{% endfor %}</td></tr>{% endfor %}
</tbody></table></body></html>
""")

def generate_html(results: list[PriceResult], products, stores: list[str]) -> Path:
    Path("reports").mkdir(exist_ok=True)
    matrix = {(r.product_id, r.store): r for r in results}
    html = HTML_TEMPLATE.render(today=date.today().strftime("%d-%m-%Y"), products=products, stores=stores, matrix=matrix, winners=choose_cheapest(results))
    path = Path("reports") / f"prices-{date.today().isoformat()}.html"
    path.write_text(html, encoding="utf-8")
    return path
