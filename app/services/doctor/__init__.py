import json
import calendar

from redis import Redis
from datetime import timedelta, datetime
from fastapi.encoders import jsonable_encoder

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, cast, distinct, Date, case, or_
from sqlalchemy.orm import defer, joinedload, load_only

from app.models import Doctor, Appointment, Patient, Hospital, HealthRecord, Medication
from app.core.security import uuid_to_base64, base64_to_uuid
from app.core.utils import ResponseHandler, Custom, get_age_group
from app.schemas.doctor import UpdateAppointment
from app.core.dummy import dummy_suggestions, exercises


class DoctorService:
    pass
