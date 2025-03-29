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
from app.core.utils import (
    ResponseHandler,
    Custom,
    get_age_group,
    status_priority_map,
    calculate_age,
)
from app.schemas.doctor import UpdateAppointment
from app.core.dummy import dummy_suggestions, exercises

from app.services.serialization import DoctorSerialization


class AppointmentService:
    # Retrieve a list of requested appointments for a specific doctor by doctor_id.
    @staticmethod
    async def get_requests(
        session_user: Doctor,
        db: AsyncSession,
    ):
        query = (
            select(Appointment)
            .join(Patient)
            .where(
                Appointment.doctor_id == session_user.id,
                Appointment.status == "requested",
            )
            .options(
                joinedload(Appointment.patient).load_only(Patient.name),
                defer(Appointment.created_at),  # Exclude created_at
                defer(Appointment.updated_at),  # Exclude updated_at
            )
            .order_by(Appointment.appointment_date.desc())
        )

        requested_appointments = (await db.execute(query)).scalars().all()
        appointments = [
            DoctorSerialization.appointment_info(info)
            for info in requested_appointments
        ]

        return appointments

    # Retrieve a list of appointments for a specific doctor
    @staticmethod
    async def get_appointments(
        session_user: Doctor,
        db: AsyncSession,
        redis: Redis,
        status: int,
        date: str | None,
        q: str | None,
        page: int,
        limit: int,
    ):
        doctor_id = uuid_to_base64(session_user.id)

        redis_key = f"users:doctor:{doctor_id}:appointments:page:{page}"
        redis_key_total = f"users:doctor:{doctor_id}:appointments:total"

        cached_data_allowed = date != "old" and status == 1 and not q

        # Retrieve doctor's appointments information from redis if exists
        if (
            (cached_appointments := redis.get(redis_key))
            and (cached_total := redis.get(redis_key_total))
            and cached_data_allowed
        ):
            return {
                "total": json.loads(cached_total),
                "appointments": json.loads(cached_appointments),
            }

        page = max(1, page)
        offset = (page - 1) * limit

        query = select(Appointment)

        order_clauses = []
        filter_args = [
            Appointment.doctor_id == session_user.id,
            Appointment.status.not_in(["requested"]),
        ]

        # Query to get the total count of the doctors' appointment
        count_query = select(func.count(Appointment.id)).where(*filter_args)

        # Handle searching by name of the patients
        if q:
            filter_args.append(Patient.name.ilike(f"%{q}%"))

        # Sort based on appointment date
        if date and date in ["latest", "old"]:
            if date == "latest":
                order_clauses.append(Appointment.appointment_date.desc())
            if date == "old":
                order_clauses.append(Appointment.appointment_date.asc())

        # Sort based on appointment 'status'
        status_priority = status_priority_map[status - 1]

        status_order = case(
            (Appointment.status == "upcoming", status_priority["upcoming"]),
            (Appointment.status == "resheduled", status_priority["resheduled"]),
            (Appointment.status == "missed", status_priority["missed"]),
            (Appointment.status == "completed", status_priority["completed"]),
            (Appointment.status == "cancelled", status_priority["cancelled"]),
        )

        # Extract all the appointments from database
        query = (
            query.join(Patient)
            .where(*filter_args)
            .options(
                joinedload(Appointment.patient).load_only(Patient.name),
                defer(Appointment.created_at),  # Exclude created_at
                defer(Appointment.updated_at),  # Exclude updated_at
            )
            .order_by(status_order, *order_clauses)
            .offset(offset)
            .limit(limit)
        )

        result = await db.execute(query)
        total_result = await db.execute(count_query)

        filtered_appointments = result.scalars().all()
        total = total_result.scalar()

        appointments = [
            DoctorSerialization.appointment_info(info) for info in filtered_appointments
        ]

        # Store caching into redis
        if cached_data_allowed:
            _total = json.dumps(total)
            _appointments = json.dumps(jsonable_encoder(appointments))
            redis.set(redis_key, _appointments, 3600)
            redis.set(redis_key_total, _total, 3600)

        return {"total": total, "appointments": appointments}

    # Retrieve a specific appointment information
    @staticmethod
    async def get_info(
        appointment_id: str, doctor: Doctor, db: AsyncSession, redis: Redis
    ):
        # Convert appointment_id from base64 string to UUID
        appointment_id = base64_to_uuid(appointment_id)

        # Query for retrieving Appoitnment informations
        appointment_query = (
            select(Appointment)
            .where(Appointment.id == appointment_id)
            .options(
                joinedload(Appointment.patient).load_only(
                    Patient.name,
                    Patient.gender,
                    Patient.img_src,
                    Patient.address,
                    Patient.date_of_birth,
                ),
                defer(Appointment.created_at),
                defer(Appointment.updated_at),
            )
        )

        appointment_info = (await db.execute(appointment_query)).scalar_one_or_none()
        # Retweak the appointment info data
        appointment_data = DoctorSerialization.merged_info(appointment_info)

        # Check if the specific Appointment record exists
        if not appointment_info:
            raise ResponseHandler.not_found_error(
                f"Appointment record #{appointment_id} not found"
            )

        # Check if the session doctor and the consulted doctor in the info are the same
        if doctor.id != appointment_info.doctor_id:
            raise ResponseHandler.no_permission(
                "You are not allowed to view this resource"
            )

        # Handle active appointments data
        if appointment_info.status in ["upcoming", "ongoing", "reshedule"]:
            # Get the consulting patients' health record
            health_query = (
                select(HealthRecord)
                .where(HealthRecord.patient_id == appointment_info.patient_id)
                .options(
                    defer(HealthRecord.created_at),
                    defer(HealthRecord.updated_at),
                )
            )

            # Get the latest/active Medication record of the consulting patient
            medication_query = (
                select(Medication)
                .where(
                    Medication.patient_id == appointment_info.patient_id,
                    # Make sure either medications or exercises exists
                    or_(
                        Medication.medications.isnot(None),
                        Medication.exercises.isnot(None),
                    ),
                )
                .options(
                    load_only(
                        Medication.medications,
                        Medication.exercises,
                        Medication.allergies,
                    )
                )
                .order_by(Medication.updated_at.desc())
                .limit(1)  # Restrict it to only get the latest one
            )

            health_result = (await db.execute(health_query)).scalar_one_or_none()
            medication_result = (
                await db.execute(medication_query)
            ).scalar_one_or_none()

            # Retweak the Health record information
            health_data = (
                DoctorSerialization.health_info(health_result) if health_result else []
            )

            # Retweak the Medication record information
            medication_data = (
                DoctorSerialization.medication_info(medication_result)
                if medication_result
                else []
            )

            # Return the Appointment info in active state
            return {
                **appointment_data,
                "health": health_data,
                "medication": medication_data,
            }

        # Retrieve specific Medication record of the appointment
        medication_query = (
            select(Medication)
            .where(Medication.appointment_id == appointment_info.id)
            .options(
                defer(Medication.doctor_id),
                defer(Medication.updated_at),
                defer(Medication.created_at),
                defer(Medication.patient_id),
                defer(Medication.appointment_id),
            )
        )

        medication_result = (await db.execute(medication_query)).scalar_one_or_none()
        medication_data = DoctorSerialization.medication_info(medication_result)

        # Return the Appointment info in inactive state
        return {
            **appointment_data,
            "health": [],
            "medication": medication_data,
        }

    # Update a specific appointment information
    @staticmethod
    async def update_info(
        id: str,
        doctor: Doctor,
        db: AsyncSession,
        payload: UpdateAppointment,
        redis: Redis,
    ):
        updated_data = {**payload.none_excluded(), "updated_at": func.now()}
        # Covert the ids to base64 and UUID
        appointment_id = base64_to_uuid(id)
        doctor_id = uuid_to_base64(doctor.id)

        # Retrieve the appointment details
        appointment_query = (
            select(Appointment)
            .where(Appointment.id == appointment_id)
            .options(
                joinedload(Appointment.patient).load_only(
                    Patient.name,
                    Patient.gender,
                    Patient.img_src,
                    Patient.address,
                    Patient.date_of_birth,
                ),
                defer(Appointment.created_at),
                defer(Appointment.updated_at),
            )
        )

        appointment_result = (await db.execute(appointment_query)).scalar_one_or_none()

        # Check if the Appointment record exists or not
        if not appointment_result:
            ResponseHandler.not_found_error(f"{id} Appointment # not found")

        patient_id = uuid_to_base64(appointment_result.patient_id)

        # Update the Appointment record
        for k, v in updated_data.items():
            if k in Appointment.__table__.columns:
                setattr(appointment_result, k, v)

        # Check if the Medication record with the same appointment_id already exists
        medication_query = select(Medication).where(
            Medication.patient_id == appointment_result.patient_id,
            Medication.appointment_id == appointment_result.id,
        )
        medication_result = (await db.execute(medication_query)).scalar_one_or_none()

        # If a Medication record w the same appointment_id already exists
        # Update the existing Medication record
        if medication_result:
            # Check if the doctor has cancelled the appointment
            if payload.status == "cancelled":
                await db.delete(medication_result)
                await db.commit()
                # Deete the patients' existing medication cache
                updating_info_redis_keys(redis, doctor_id, patient_id)
                redis.delete(f"patients:medications:{patient_id}")
                # Return the delete success message
                return {"message": "Successfully deleted medication record"}

            # If not cancelled update the Medication record
            for k, v in updated_data.items():
                if k in Medication.__table__.columns:
                    setattr(medication_result, k, v)

        elif payload.status != "declined":
            # If an existing Medication record does not exists
            # Extract the data from the payload if it matches w Medication record
            new_medication_data = {
                k: v
                for k, v in updated_data.items()
                if k != "updated_at" and k in Medication.__table__.columns
            }

            # This suggestion will be automatically added by default when a new Medication record is created
            # Doctors' can change the settings/or Add AI assistance feature
            age = calculate_age(appointment_result.patient.date_of_birth)
            age_group = get_age_group(age)
            suggestion_data = dummy_suggestions[age_group]

            # Create a new Medication record
            medication_result = Medication(
                **new_medication_data,
                **suggestion_data,
                expiry=30,
                appointment_id=appointment_result.id,
                doctor_id=appointment_result.doctor_id,
                patient_id=appointment_result.patient_id,
                primary_goals=Custom.convert_list_to_str(
                    appointment_result.purpose_of_visit
                ),
            )
            # Add the new Medication record to the database
            db.add(medication_result)

        # Commit and refresh the new Medication record
        await db.commit()
        await db.refresh(medication_result)
        await db.refresh(appointment_result)

        # Update the redis keys
        updating_info_redis_keys(redis, doctor_id, patient_id)

        # Retweak the Appointment info data
        appointment_data = DoctorSerialization.appointment_info(appointment_result)

        # Return newly created Appointment, Medication info data
        return {
            **appointment_data,
            "medication": medication_result or [],
        }

    @staticmethod
    async def get_appointmets_today(
        doctor_id: str,
        session_user: Doctor,
        db: AsyncSession,
    ):
        today = datetime.today()
        doctor_id = base64_to_uuid(doctor_id)

        if session_user.id != doctor_id:
            raise ResponseHandler.no_permission(
                "you don't have permission to view this resource"
            )

        # Query for retrieving the total number of visits the doctor has today
        count_query = select(func.count(Appointment.id)).where(
            Appointment.doctor_id == session_user.id,
            Appointment.status.not_in(["requested", "declined", "cancelled"]),
            cast(Appointment.appointment_date, Date) == cast(today, Date),
        )

        total_appointment = (await db.execute(count_query)).scalar()

        return total_appointment


def updating_info_redis_keys(redis: Redis, doctor_id: str, patient_id: str):
    # Redis key for appointments of the doctor
    doctor_appointment_key = f"users:doctor:{doctor_id}:appointments"
    doctor_appointment_count_key = f"{doctor_appointment_key}:total"
    doctor_keys = redis.keys(f"{doctor_appointment_key}:page:*")
    doctor_keys.extend([doctor_appointment_count_key])

    # Redis keys of the patient who consulted the appointment
    patient_medication_key = f"patients:medications:{patient_id}"
    patient_appointment_key = f"patients:appointments:{patient_id}"
    upcoming_appointments_key = f"{patient_appointment_key}:upcoming"
    patient_appointment_count_key = f"{patient_appointment_key}:total"

    patient_keys = redis.keys(f"{patient_appointment_key}:page:*")
    patient_keys.extend(
        [
            upcoming_appointments_key,
            patient_medication_key,
            patient_appointment_count_key,
        ]
    )

    # Delete the appointments cache data of both the doctor and patient
    redis.delete(*doctor_keys, *patient_keys)
