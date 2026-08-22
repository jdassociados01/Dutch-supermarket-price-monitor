// Cole este código em Extensões > Apps Script, dentro da planilha.
// Configure o token em Configurações do projeto > Propriedades do script,
// com a chave GITHUB_TOKEN — nunca cole o token direto aqui no código.

var GITHUB_OWNER = "jdassociados01";
var GITHUB_REPO = "Dutch-supermarket-price-monitor";
var WEEKLY_WORKFLOW_FILE = "weekly-price-check.yml";
var SEARCH_WORKFLOW_FILE = "search-product.yml";
var SEARCH_TAB_NAME = "Buscar Produto";
var SEARCH_QUERY_CELL = "B2";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Preços dos supermercados")
    .addItem("Atualizar lista semanal agora", "runPriceCheck")
    .addItem("Buscar produto (aba 'Buscar Produto')", "runSingleSearch")
    .addToUi();
}

function getGithubToken_() {
  var token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) {
    SpreadsheetApp.getUi().alert(
      "Token não configurado. Vá em Configurações do projeto > Propriedades do script e crie GITHUB_TOKEN com o token do GitHub.",
    );
  }
  return token;
}

function dispatchWorkflow_(workflowFile, inputs) {
  var token = getGithubToken_();
  if (!token) return null;

  var url =
    "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/actions/workflows/" + workflowFile + "/dispatches";

  var payload = { ref: "main" };
  if (inputs) payload.inputs = inputs;

  return UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

function runPriceCheck() {
  var response = dispatchWorkflow_(WEEKLY_WORKFLOW_FILE, null);
  if (!response) return;

  var status = response.getResponseCode();
  if (status === 204) {
    SpreadsheetApp.getUi().alert(
      "Atualização iniciada! Leva alguns minutos (consulta os supermercados) — a planilha atualiza sozinha quando terminar. Acompanhe em: https://github.com/" +
        GITHUB_OWNER +
        "/" +
        GITHUB_REPO +
        "/actions",
    );
  } else {
    SpreadsheetApp.getUi().alert("Erro ao iniciar (HTTP " + status + "): " + response.getContentText());
  }
}

function runSingleSearch() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SEARCH_TAB_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Aba "' + SEARCH_TAB_NAME + '" não encontrada.');
    return;
  }

  var product = sheet.getRange(SEARCH_QUERY_CELL).getValue();
  if (!product) {
    SpreadsheetApp.getUi().alert('Escreva o nome do produto na célula ' + SEARCH_QUERY_CELL + ' da aba "' + SEARCH_TAB_NAME + '" antes de buscar.');
    return;
  }

  var response = dispatchWorkflow_(SEARCH_WORKFLOW_FILE, { product: String(product) });
  if (!response) return;

  var status = response.getResponseCode();
  if (status === 204) {
    SpreadsheetApp.getUi().alert(
      'Buscando "' + product + '" em 8 lojas... Leva cerca de 1 minuto — a aba "' + SEARCH_TAB_NAME + '" atualiza sozinha quando terminar.',
    );
  } else {
    SpreadsheetApp.getUi().alert("Erro ao iniciar (HTTP " + status + "): " + response.getContentText());
  }
}
