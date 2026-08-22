import fs from "node:fs";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { PriceResult } from "./scraper.js";
import { cellText } from "./report.js";

const REQUIRED_ENV = ["EMAIL_FROM", "EMAIL_TO", "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD"] as const;

function createTransporter(): Transporter {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Email not configured. Missing: ${missing.join(", ")}`);
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
  });
}

export async function sendReportEmail(htmlPath: string, weekLabel: string): Promise<void> {
  const transporter = createTransporter();
  const html = fs.readFileSync(htmlPath, "utf-8");

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: `Preços dos supermercados – semana de ${weekLabel}`,
    text: "Abra este e-mail em modo HTML para ver a tabela.",
    html,
  });
}

/** Avisa quando a busca avulsa de um produto (aba "Buscar Produto") termina
 * — ela roda em segundo plano no GitHub Actions, então sem isso não tem como
 * saber que já acabou sem ficar checando a planilha. */
export async function sendSearchDoneEmail(productName: string, results: PriceResult[]): Promise<void> {
  const transporter = createTransporter();

  const lines = results.map((r) => `${r.store}: ${cellText(r)}`);
  const text = `Busca por "${productName}" concluída.\n\n${lines.join("\n")}\n\nVeja a planilha, aba "Buscar Produto".`;
  const html = `<p>Busca por <b>"${productName}"</b> concluída.</p><ul>${lines
    .map((line) => `<li>${line}</li>`)
    .join("")}</ul><p>Veja a planilha, aba "Buscar Produto".</p>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: `Busca concluída: ${productName}`,
    text,
    html,
  });
}
