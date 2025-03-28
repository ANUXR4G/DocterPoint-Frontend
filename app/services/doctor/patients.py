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


class PatientService:
    # Retrieve a list of appointed patients to a doctor by doctor_id.
    @staticmethod
    async def get_patients(
        doctor_id: str,
        session_user: Doctor,
        db: AsyncSession,
        redis: Redis,
        q: str | None,
        age: str | None,
        gender: str | None,
        page: int,
        limit: int,
    ):
        redis_key = f"users:doctor:{doctor_id}:patients:page:{page}"
        redis_key_total = f"users:doctor:{doctor_id}:patients:total"

        page = max(1, page)
        offset = (page - 1) * limit

        query = select(Patient)

        order_clauses = []
        filter_args = [Appointment.doctor_id == session_user.id]

        # Extract all the patient ids associated with doctor
        patient_ids = select(distinct(Appointment.patient_id)).where(*filter_args)

        no_filter_applied = not q and not age and not gender

        # Retrieve doctor's appointed patients information from redis if exists
        if (
            (cached_patients_info := redis.get(redis_key))
            and (cached_total := redis.get(redis_key_total))
            and no_filter_applied
        ):
            return {
                "total": json.loads(cached_total),
                "patients": json.loads(cached_patients_info),
            }

        # Apply searching filtering
        if q:
            filter_args.append(Patient.name.ilike(f"%{q}%"))

        # Extract all the appointed patients informations
        query = (
            query.where(Patient.id.in_(patient_ids))
            .options(
                defer(Patient.role),  # Exclude updated_at)
                defer(Patient.password),  # Exclude password
                defer(Patient.created_by),  # Exclude created_by
                defer(Patient.created_at),  # Exclude created_at
                defer(Patient.updated_at),  # Exclude updated_at)
            )
            .offset(offset)
            .limit(limit)
        )

        # Count Statement for the distinct (no duplicate) ids of the patients
        count = select(func.count(distinct(Appointment.patient_id))).where(*filter_args)

        # Sort the patients list based on age
        if age and age in ["young", "old"]:
            calculated_age = func.date_part(
                "year", func.age(cast(Patient.date_of_birth, Date))
            )

            if age == "young":
                order_clauses.append(calculated_age.desc())
            elif age == "old":
                order_clauses.append(calculated_age.asc())

        # Sort the patients list based on gender
        if gender and gender in ["male", "female"]:
            order_clauses.append(
                Patient.gender.desc() if gender == "male" else Patient.gender.asc(),
            )

        # Sort the retrieved query based of provided orders
        query = query.order_by(*order_clauses)

        # Retrieve the Query result
        result = (await db.execute(query)).scalars().all()
        patients = [DoctorSerialization.patient_info(info) for info in result]

        count_query = await db.execute(count)
        total = count_query.scalar()

        if no_filter_applied:
            _total = json.dumps(total)
            _patients = json.dumps(jsonable_encoder(patients))
            redis.set(redis_key, _patients, 3600)
            redis.set(redis_key_total, _total, 3600)

        return {"total": total, "patients": patients}

    # Retrieve a list of appointments of a specific patient
    @staticmethod
    async def get_patient_appointments(
        patient_id: str,
        doctor: Doctor,
        db: AsyncSession,
    ):
        patient_id = base64_to_uuid(patient_id)

        query = (
            select(Appointment)
            .where(
                Appointment.patient_id == patient_id,
                Appointment.doctor_id == doctor.id,
                Appointment.status.not_in(["cancelled", "declined", "requested"]),
            )
            .options(
                joinedload(Appointment.doctor)
                .load_only(Doctor.name)
                .joinedload(Doctor.hospital)
                .load_only(Hospital.name, Hospital.address),
                defer(Appointment.created_at),
                defer(Appointment.updated_at),
                defer(Appointment.referred_by),
                defer(Appointment.patient_note),
                defer(Appointment.doctor_note),
            )
            .limit(10)
            .order_by(Appointment.appointment_date.desc())
        )

        result = (await db.execute(query)).scalars().all()

        appointments = [DoctorSerialization.patient_appointment(v) for v in result]

        return appointments
