# Dutch Supermarket Price Monitor

Script pessoal para consultar, toda segunda de manhã e sexta à tarde, os preços e promoções dos produtos cadastrados na planilha do Google Sheets, em supermercados holandeses. Também permite buscar um produto avulso, sob demanda. Não é um produto, não tem usuários, não tem banco de dados nem API.

## Estrutura

```text
src/
  products.ts   # base de produtos conhecidos (termos de busca corretos, marca exigida, etc.)
  stores.ts     # lista de supermercados
  scraper.ts    # checkAlbertHeijn, checkJumbo, checkHoogvliet, checkAldi, checkMakro, checkEtos, checkKruidvat, checkHema
  sheets.ts     # lê produtos da planilha e escreve os preços de volta (nas duas abas)
  report.ts     # gera o HTML e o CSV da lista semanal
  email.ts      # envia o e-mail semanal e o aviso de busca avulsa
  main.ts       # orquestra a lista semanal
  searchOne.ts  # orquestra a busca avulsa de um produto
apps-script/
  Code.gs       # cole na planilha (Extensões > Apps Script) para os botões
```

## A planilha

Google Sheets: https://docs.google.com/spreadsheets/d/1xbN1irwkvAcVgGmn-k4mi0wRZMuNtoECn3ljULrv_Z0/edit

**Aba "Lista de Compras Semanais"** — colunas `Product | Aldi | Jumbo | Albert Heijn | Hoogvliet | Makro | Mais barato` (ordem pode mudar, o script acha cada coluna pelo nome) + coluna `M` com um resumo de quantos produtos cada mercado tem como o mais barato.

Para adicionar um produto: só escrever o nome na próxima linha da coluna "Product". O script tenta casar o nome digitado (tolera erro de digitação, tipo "Jong kass" → "Jonge kaas") com um produto já cadastrado em `src/products.ts` (termos de busca corretos, marca exigida); se não achar nenhum parecido, usa o texto digitado como termo de busca mesmo.

**Aba "Buscar Produto"** — escreva um produto na célula `B2` e use o botão do menu (ou rode manualmente) para buscar esse produto nas 8 lojas de uma vez (as 5 de mercearia + Etos, Kruidvat, Hema — essas três não vendem mercearia fresca, servem pra produtos de beleza/casa/farmácia). Resultado aparece a partir da linha 5.

## Instalação

```bash
npm install
npx playwright install chrome
cp .env.example .env
```

Edite `.env` com os dados de SMTP para o envio de e-mail.

### Credencial do Google (conta de serviço)

O script escreve na planilha usando uma conta de serviço do Google Cloud (não o seu login pessoal). Para rodar localmente, coloque o arquivo JSON da chave em `credentials/google-service-account.json` (pasta ignorada pelo git). Para o GitHub Actions, configure o secret `GOOGLE_SERVICE_ACCOUNT_JSON` com o conteúdo inteiro do arquivo. A conta de serviço precisa ter acesso de **Editor** na planilha.

## Uso

```bash
npm run check-prices                       # lista semanal completa
npm run search-product -- "nome do produto" # busca avulsa (ou lê a célula B2 se omitido)
```

Ambos escrevem na planilha e geram/enviam relatório conforme o caso. Para enviar e-mail também na lista semanal: `npm run check-prices -- --send-email`.

## Estado atual por supermercado

| Supermercado | Situação |
|---|---|
| Jumbo | Funciona — testado com Playwright real (Chrome), preço, quantidade, preço/kg-unidade e promoção. |
| Aldi | Funciona — testado com Playwright real. Preço por kg já vem calculado pelo site quando disponível. |
| Hoogvliet | Funciona — usa o Chrome instalado de verdade (não o Chromium de testes do Playwright) e navega como um usuário real (home → aceita/recusa cookies → digita na busca) em vez de ir direto na URL de resultados, que a Incapsula esvaziava silenciosamente. |
| Kruidvat, Hema | Funcionam (só entram na busca avulsa). |
| Albert Heijn | Bloqueia acesso automatizado (Akamai Bot Manager) mesmo com Chrome real e navegação realista. Retorna "Verificação manual necessária" na automação. |
| Makro | Bloqueia acesso automatizado (mesmo com Chrome real) — parece um limite de taxa mais duradouro. Retorna "Verificação manual necessária". |
| Etos | Bloqueia (mesmo grupo/proteção da Albert Heijn). Retorna "Verificação manual necessária". |
| Lidl | Removida — a busca encontra produtos reais mas a grade de preços nunca termina de carregar. Sem coluna na planilha. |

Nenhum bloqueio de bot é contornado (sem CAPTCHA, sem login, sem disfarce de automação, sem spoofing de fingerprint). Usar o Chrome real em vez do Chromium de testes e navegar pela home antes de buscar não é um contorno — é o mesmo caminho que uma pessoa normal usaria. Quando um site bloqueia mesmo assim, ou não tem fonte confiável, o resultado mostra "Verificação manual necessária" em vez de um preço inventado.

Um preço real (de qualquer origem, automática ou digitada manualmente) nunca é apagado por um resultado sem sucesso de uma execução seguinte — só é sobrescrito quando a automação encontra um preço novo de verdade.

## Botões na planilha

Cole `apps-script/Code.gs` em Extensões > Apps Script na planilha (veja instruções no próprio arquivo) para dois itens de menu: **Atualizar lista semanal agora** e **Buscar produto (aba 'Buscar Produto')**. Cada um dispara o workflow correspondente no GitHub Actions.

## GitHub Actions

- `.github/workflows/weekly-price-check.yml` roda automaticamente toda **segunda 08:00** e **sexta 15:00** (horário de Amsterdam) e também pode ser disparado manualmente (aba Actions → Run workflow, ou pelo botão da planilha).
- `.github/workflows/search-product.yml` roda só sob demanda (botão da planilha ou aba Actions), recebendo o nome do produto.

Secrets necessários: `GOOGLE_SERVICE_ACCOUNT_JSON`, `EMAIL_FROM`, `EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`.
