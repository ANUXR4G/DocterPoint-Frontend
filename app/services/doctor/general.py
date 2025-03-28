import json
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
from app.services.serialization import DoctorSerialization


class DoctorService:
    @staticmethod
    async def get_info(session_user: Doctor, db: AsyncSession, redis: Redis):
        doctor_id = uuid_to_base64(session_user.id)
        redis_key = f"users:doctor:{doctor_id}:info"

        # If doctors' profile info cache exists
        if cached_doctor_info := redis.get(redis_key):
            return json.loads(cached_doctor_info)

        query = (
            select(Doctor)
            .where(Doctor.id == session_user.id)
            .options(
                defer(Doctor.password),  # Exclude password
                defer(Doctor.created_by),  # Exclude created_by
                defer(Doctor.created_at),  # Exclude created_at
                defer(Doctor.updated_at),  # Exclude updated_at
            )
        )

        profile_result = (await db.execute(query)).scalar_one_or_none()

        # Handle error if doctor profile information not found
        if not profile_result:
            raise ResponseHandler.not_found_error("Doctor information not found")

        # Restructure the result (e.g, replace ids w base64 strings)
        profile_info = DoctorSerialization.profile_info(profile_result)

        # Convert the data into json and set the data into redis caching
        profile_info_json = json.dumps(jsonable_encoder(profile_info))
        redis.set(redis_key, profile_info_json, 3600)

        # Return doctors' profile information
        return profile_info

    # Retrieve analytics of patients and appointments for a specific doctor.
    @staticmethod
    async def get_analytics(
        doctor_id: str,
        session_user: Doctor,
        db: AsyncSession,
        period_type: str,
    ):
        if period_type not in ["week", "month"]:
            raise ResponseHandler.no_permission("Invalid param value.")

        if session_user.id != base64_to_uuid(doctor_id):
            raise ResponseHandler.no_permission("Permission not granted.")

        today = datetime.now()
        current_year = datetime.now().year
        start_of_week = today - timedelta(days=today.weekday() + 1)

        # Get the current week day dates starting from Sunday
        week_dates = [start_of_week + timedelta(days=i) for i in range(7)]
        # Get all the day names starting from Sunday
        week_days = [
            (start_of_week + timedelta(days=i)).strftime("%A") for i in range(7)
        ]
        # Get all the month names of a year starting from January
        months = [
            (datetime(current_year, month, 1)).strftime("%B") for month in range(1, 13)
        ]

        # Week day results
        week_result = {
            day: {
                "patients": {"male": 0, "female": 0},
                "appointments": {"male": 0, "female": 0},
            }
            for day in week_days
        }
        # Months results
        month_result = {
            name: {
                "patients": {"male": 0, "female": 0},
                "appointments": {"male": 0, "female": 0},
            }
            for name in months
        }

        for gender in ["male", "female"]:
            # Extract the patient and appointment analytics of current week
            if period_type == "week":
                # Iterate through each day of the current week
                for i, day in enumerate(week_days):
                    patient_query = (
                        select(func.count(distinct(Appointment.patient_id)))
                        .join(Appointment.patient)
                        .where(
                            Appointment.doctor_id == session_user.id,
                            cast(Appointment.appointment_date, Date)
                            == cast(week_dates[i], Date),
                            Appointment.status.not_in(
                                ["requested", "declined", "cancelled"]
                            ),
                            Patient.gender == gender,
                        )
                    )
                    appointment_query = (
                        select(func.count(Appointment.id))
                        .join(Appointment.patient)
                        .where(
                            Appointment.doctor_id == session_user.id,
                            cast(Appointment.appointment_date, Date)
                            == cast(week_dates[i], Date),
                            Appointment.status.not_in(
                                ["requested", "declined", "cancelled"]
                            ),
                            Patient.gender == gender,
                        )
                    )

                    # Update the week result to contain result details categorized by gender and week days
                    week_result[day]["patients"][gender] = (
                        await db.execute(patient_query)
                    ).scalar()
                    week_result[day]["appointments"][gender] = (
                        await db.execute(appointment_query)
                    ).scalar()

            # Extract the patient and appointment analytics of the current year
            elif period_type == "month":
                # Iterate through each month of the current year
                for i, name in enumerate(months):
                    start_of_month = today.replace(month=i + 1, day=1)
                    end_of_month = (start_of_month + timedelta(days=32)).replace(
                        day=1
                    ) - timedelta(days=1)

                    patient_query = (
                        select(func.count(distinct(Appointment.patient_id)))
                        .join(Appointment.patient)
                        .where(
                            Appointment.doctor_id == session_user.id,
                            cast(Appointment.appointment_date, Date).between(
                                start_of_month, end_of_month
                            ),
                            Appointment.status.not_in(
                                ["requested", "declined", "cancelled"]
                            ),
                            Patient.gender == gender,
                        )
                    )
                    appointment_query = (
                        select(func.count(Appointment.id))
                        .join(Appointment.patient)
                        .where(
                            Appointment.doctor_id == session_user.id,
                            cast(Appointment.appointment_date, Date).between(
                                start_of_month, end_of_month
                            ),
                            Appointment.status.not_in(
                                ["requested", "declined", "cancelled"]
                            ),
                            Patient.gender == gender,
                        )
                    )

                    # Update the month result to contain result details categorized by gender and months
                    month_result[name]["patients"][gender] = (
                        await db.execute(patient_query)
                    ).scalar()
                    month_result[name]["appointments"][gender] = (
                        await db.execute(appointment_query)
                    ).scalar()

        return week_result if period_type == "week" else month_result
