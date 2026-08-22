import { google } from "googleapis";
import fs from "node:fs";

const key = JSON.parse(fs.readFileSync("credentials/google-service-account.json", "utf-8"));
const auth = new google.auth.GoogleAuth({ credentials: key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = "1xbN1irwkvAcVgGmn-k4mi0wRZMuNtoECn3ljULrv_Z0";

await sheets.spreadsheets.values.clear({
  spreadsheetId: SPREADSHEET_ID,
  range: "'Buscar Produto'!C4",
});
await sheets.spreadsheets.values.update({
  spreadsheetId: SPREADSHEET_ID,
  range: "'Buscar Produto'!A4",
  valueInputOption: "USER_ENTERED",
  requestBody: { values: [["Loja", "Resultado"]] },
});
console.log("Cabeçalho atualizado.");
