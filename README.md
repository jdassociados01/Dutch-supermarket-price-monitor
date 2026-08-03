# Dutch Supermarket Price Monitor

Script pessoal para consultar, toda segunda-feira, os preços e promoções de uma lista fixa de produtos em supermercados holandeses. Não é um produto, não tem usuários, não tem banco de dados nem API.

## Estrutura

```text
src/
  products.ts   # lista de produtos e termos de busca
  stores.ts     # lista de supermercados
  scraper.ts    # checkAlbertHeijn, checkJumbo, checkHoogvliet, checkLidl, checkAldi, checkMakro
  report.ts     # gera o HTML e o CSV
  email.ts      # envia o e-mail semanal
  main.ts       # orquestra tudo
```

## Instalação

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Edite `.env` com os dados de SMTP para o envio de e-mail.

## Uso

```bash
npm run check-prices
```

Gera `reports/prices-DD-MM-AAAA.html` e `.csv`. Para também enviar o e-mail:

```bash
npm run check-prices -- --send-email
```

## Estado atual por supermercado

| Supermercado | Situação |
|---|---|
| Jumbo | Funciona — testado com Playwright real. |
| Albert Heijn | Bloqueia acesso automatizado (Akamai Bot Manager). Retorna sempre "Verificação manual necessária" neste ambiente. |
| Hoogvliet | Bloqueia acesso automatizado (Incapsula). Retorna sempre "Verificação manual necessária" neste ambiente. |
| Lidl, Aldi, Makro | Ainda não implementados. |

Nenhum bloqueio de bot é contornado (sem CAPTCHA, sem login, sem disfarce de automação). Quando um site bloqueia a consulta, o resultado mostra "Verificação manual necessária" em vez de um preço inventado.

## GitHub Actions

O workflow em `.github/workflows/weekly-price-check.yml` roda toda segunda-feira (duas vezes em UTC, para cobrir CET/CEST) e também pode ser disparado manualmente. Configure os secrets `EMAIL_FROM`, `EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` no repositório.
