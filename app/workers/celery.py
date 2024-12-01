from celery import Celery
from app.core.config import settings

celery = Celery(__name__)
celery.conf.broker_url = settings.celery_broker_url
celery.conf.result_backend = settings.celery_result_backend
celery.conf.broker_connection_retry_on_startup = True

celery.conf.timezone = "UTC"

# periodic tasts using beat scheduler 
celery.conf.beat_schedule = {
    "send-greeting-every-1-hour": {
        "task": "app.workers.tasks.greeting",
        "schedule": 3600,
        "args": (settings.owner_email,)
    }
}

celery.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    include=['app.workers.tasks']
)