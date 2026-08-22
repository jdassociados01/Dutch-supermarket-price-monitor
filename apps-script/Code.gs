// Cole este código em Extensões > Apps Script, dentro da planilha.
// Configure o token em Configurações do projeto > Propriedades do script,
// com a chave GITHUB_TOKEN — nunca cole o token direto aqui no código.

var GITHUB_OWNER = "jdassociados01";
var GITHUB_REPO = "Dutch-supermarket-price-monitor";
var WORKFLOW_FILE = "weekly-price-check.yml";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Preços dos supermercados")
    .addItem("Atualizar agora", "runPriceCheck")
    .addToUi();
}

function runPriceCheck() {
  var token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) {
    SpreadsheetApp.getUi().alert(
      "Token não configurado. Vá em Configurações do projeto > Propriedades do script e crie GITHUB_TOKEN com o token do GitHub.",
    );
    return;
  }

  var url =
    "https://api.github.com/repos/" +
    GITHUB_OWNER +
    "/" +
    GITHUB_REPO +
    "/actions/workflows/" +
    WORKFLOW_FILE +
    "/dispatches";

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
    },
    payload: JSON.stringify({ ref: "main" }),
    muteHttpExceptions: true,
  });

  var status = response.getResponseCode();
  if (status === 204) {
    SpreadsheetApp.getUi().alert(
      "Atualização iniciada! Leva alguns minutos (consulta 6 supermercados) — a planilha atualiza sozinha quando terminar. Acompanhe em: https://github.com/" +
        GITHUB_OWNER +
        "/" +
        GITHUB_REPO +
        "/actions",
    );
  } else {
    SpreadsheetApp.getUi().alert("Erro ao iniciar (HTTP " + status + "): " + response.getContentText());
  }
}
