from app.workers.celery import celery
from app.core.config import settings
from app.services.mail import send_email


@celery.task(name="app.workers.tasks.greeting")
def greet_owner(name: str):
    return f"Hello MF, you've been coding for fckn 1hr!"

@celery.task(name="app.workers.tasks.emails")
def send_email_task(recipient: str, subject: str, body: str):
    send_email(recipient, subject, body)
    return { "message": "successfully email sent!", "sender": settings.owner_email, "recipient": recipient }
    
