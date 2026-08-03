# Dutch Supermarket Price Monitor

Projeto independente para comparar semanalmente preços de produtos em supermercados da Holanda.

## Importante

Este projeto não altera nem depende do BuscarBaby. Coloque-o em uma pasta e repositório separados.

## Estado atual

- Estrutura completa do projeto criada.
- Lista de produtos e supermercados configurável.
- Normalização, comparação, histórico, relatórios e envio por e-mail implementados.
- GitHub Actions configurado para segunda-feira às 08:00 em `Europe/Amsterdam`.
- Conectores dos supermercados estão em modo seguro de implementação: não inventam preços e retornam erro claro até que cada fonte oficial seja validada.

## Instalação

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
python -m src.main --manual
```

## Configuração

Edite `.env`:

```env
POSTCODE=
HOUSE_NUMBER=
CITY=
EMAIL_FROM=
EMAIL_TO=
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
```

Edite os produtos em `config/products.yaml`.

## Execução

```bash
python -m src.main --manual
```

Os relatórios serão gravados em `reports/` e o histórico em `data/history.csv`.

## GitHub Actions

1. Crie um repositório separado no GitHub.
2. Envie apenas esta pasta para o novo repositório.
3. Em **Settings → Secrets and variables → Actions**, crie os secrets descritos em `.github/workflows/weekly-price-check.yml`.
4. Ative Actions.

O workflow roda duas vezes em UTC e o script executa a coleta somente quando for segunda-feira às 08:00 no horário de Amsterdam. Isso trata automaticamente CET e CEST.

## Próxima etapa necessária

Validar, individualmente, as fontes oficiais de Lidl, Aldi, Jumbo, Albert Heijn, Hoogvliet e Makro e implementar cada conector em `src/stores/`. O sistema não usa preços de mecanismos de busca e não contorna CAPTCHA ou login.
