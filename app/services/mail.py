import smtplib
from email.mime.text import MIMEText
from app.core.config import settings
from email.mime.multipart import MIMEMultipart


def send_email(recipient: str, subject: str, body: str):
    sender_email = settings.owner_email

    # create the mail
    message = MIMEMultipart()
    message["From"] = sender_email
    message["To"] = recipient
    message["Subject"] = subject
    message.attach(MIMEText(body, "plain"))

    # connect to gmail smtp with oauth2 token 
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.ehlo()
            server.login(sender_email, settings.smtp_password)
            server.sendmail(sender_email, recipient, message.as_string())
    except Exception as e:
        print(f"failed to send email: {e}")