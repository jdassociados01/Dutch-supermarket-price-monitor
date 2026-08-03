import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

const REQUIRED_ENV = ["EMAIL_FROM", "EMAIL_TO", "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD"] as const;

export async function sendReport(htmlPath: string): Promise<void> {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Email not configured. Missing: ${missing.join(", ")}`);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const html = fs.readFileSync(htmlPath, "utf-8");
  const stem = path.basename(htmlPath, ".html").replace(/^prices-/, "");

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: `Preços dos supermercados – ${stem}`,
    text: "Abra este e-mail em modo HTML para ver o relatório.",
    html,
  });
}
