import os
import smtplib
from email.message import EmailMessage
from pathlib import Path

def send_report(html_path: Path) -> None:
    required = ["EMAIL_FROM", "EMAIL_TO", "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD"]
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError(f"Email not configured. Missing: {', '.join(missing)}")
    msg = EmailMessage()
    msg["From"] = os.environ["EMAIL_FROM"]
    msg["To"] = os.environ["EMAIL_TO"]
    msg["Subject"] = f"Preços dos supermercados – {html_path.stem.replace('prices-', '')}"
    msg.set_content("Abra este e-mail em modo HTML para ver o relatório.")
    msg.add_alternative(html_path.read_text(encoding="utf-8"), subtype="html")
    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ["SMTP_PORT"])) as smtp:
        smtp.starttls()
        smtp.login(os.environ["SMTP_USERNAME"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(msg)
