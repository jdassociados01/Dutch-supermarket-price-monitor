# Dutch Supermarket Price Monitor

Script pessoal para consultar, toda segunda de manhã e sexta à tarde, os preços e promoções dos produtos cadastrados na planilha do Google Sheets, em supermercados holandeses. Não é um produto, não tem usuários, não tem banco de dados nem API.

## Estrutura

```text
src/
  products.ts   # base de produtos conhecidos (termos de busca corretos, marca exigida, etc.)
  stores.ts     # lista de supermercados
  scraper.ts    # checkAlbertHeijn, checkJumbo, checkHoogvliet, checkLidl, checkAldi, checkMakro
  sheets.ts     # lê a lista de produtos da planilha e escreve os preços de volta
  report.ts     # gera o HTML e o CSV
  email.ts      # envia o e-mail semanal
  main.ts       # orquestra tudo
```

## A planilha

Google Sheets: https://docs.google.com/spreadsheets/d/1xbN1irwkvAcVgGmn-k4mi0wRZMuNtoECn3ljULrv_Z0/edit
Aba: **Lista de Compras Semanais**

Colunas: `Product | Lidl | Aldi | Jumbo | Albert Heijn | Hoogvliet | Makro | Mais barato` (a ordem das colunas pode mudar — o script lê o cabeçalho e acha cada coluna pelo nome).

**Para adicionar um produto**: só escrever o nome na próxima linha da coluna "Product". Não precisa editar código. O script tenta casar o nome digitado (tolera erro de digitação, tipo "Jong kass" → "Jonge kaas") com um produto já cadastrado em `src/products.ts` (que tem os termos de busca corretos pra cada loja); se não achar nenhum parecido, usa o texto digitado como termo de busca mesmo, então funciona também pra produtos totalmente novos — só que sem a curadoria de termos alternativos/marca exigida que os produtos cadastrados têm.

## Instalação

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Edite `.env` com os dados de SMTP para o envio de e-mail.

### Credencial do Google (conta de serviço)

O script escreve na planilha usando uma conta de serviço do Google Cloud (não o seu login pessoal). Para rodar localmente, coloque o arquivo JSON da chave em `credentials/google-service-account.json` (pasta ignorada pelo git). Para o GitHub Actions, configure o secret `GOOGLE_SERVICE_ACCOUNT_JSON` com o conteúdo inteiro do arquivo. A conta de serviço precisa ter acesso de **Editor** na planilha (compartilhar com o e-mail `client_email` que está dentro do JSON).

## Uso

```bash
npm run check-prices
```

Lê os produtos da planilha, consulta os preços, escreve de volta nas colunas da planilha e também gera `reports/prices-DD-MM-AAAA.html` e `.csv`. Para também enviar o e-mail:

```bash
npm run check-prices -- --send-email
```

## Estado atual por supermercado

| Supermercado | Situação |
|---|---|
| Jumbo | Funciona — testado com Playwright real, com preço, quantidade, preço/kg-unidade e promoção. |
| Aldi | Funciona — testado com Playwright real. Preço por kg já vem calculado pelo próprio site quando disponível. |
| Albert Heijn | Bloqueia acesso automatizado (Akamai Bot Manager, confirmado até com Playwright real). Retorna sempre "Verificação manual necessária" na automação. |
| Hoogvliet | Bloqueia acesso automatizado (Incapsula, confirmado até com Playwright real). Retorna sempre "Verificação manual necessária" na automação. |
| Makro | Bloqueia acesso automatizado (mesmo padrão de bloqueio). Retorna sempre "Verificação manual necessária" na automação. |
| Lidl | Busca encontra produtos reais mas a grade de preços não carrega (trava em "loading"). Retorna sempre "Verificação manual necessária". |

Nenhum bloqueio de bot é contornado (sem CAPTCHA, sem login, sem disfarce de automação, sem OCR do folder). Quando um site bloqueia a consulta ou não tem fonte confiável, o resultado mostra "Verificação manual necessária" em vez de um preço inventado. Albert Heijn, Hoogvliet e Makro podem ser checados manualmente (fora da automação) — ver histórico da conversa para os preços reais coletados assim.

## GitHub Actions ("o botão")

O workflow em `.github/workflows/weekly-price-check.yml` roda automaticamente toda **segunda 08:00** e toda **sexta 15:00** (horário de Amsterdam, duas entradas de cron cada para cobrir CET/CEST). Também dá pra rodar na hora: na aba **Actions** do repositório no GitHub, escolha o workflow "Weekly supermarket price check" e clique em **Run workflow** — esse é o botão manual, sem precisar de frontend nenhum.

Secrets necessários no repositório: `GOOGLE_SERVICE_ACCOUNT_JSON`, `EMAIL_FROM`, `EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`.
