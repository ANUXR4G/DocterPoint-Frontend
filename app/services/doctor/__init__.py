import json
import calendar

from redis import Redis
from datetime import timedelta, datetime, timezone
from fastapi.encoders import jsonable_encoder

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, cast, distinct, Date, case
from sqlalchemy.orm import defer, joinedload

from app.models import Doctor, Appointment, Patient
from app.core.security import uuid_to_base64, base64_to_uuid
from app.core.utils import ResponseHandler

# cal = calendar.Calendar(firstweekday=6)


class DoctorService:
    # Retrieve information of a specific doctor based on the current session.
    @staticmethod
    async def get_info(session_user: Doctor, db: AsyncSession, redis: Redis):
        doctor_id = uuid_to_base64(session_user.id)
        redis_key = f"users:doctor:{doctor_id}:info"

        # Return cache if exists
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

        result = await db.execute(query)
        db_profile_info = result.scalar_one_or_none()

        # Handle error if doctor profile information not found
        if not db_profile_info:
            raise ResponseHandler.not_found_error("Doctor information not found")

        # Restructure the result (e.g, replace ids w base64 strings)
        profile_info = serialized_doctor(db_profile_info)

        # Convert the data into json and set the data into redis caching
        profile_info_json = json.dumps(jsonable_encoder(profile_info))
        redis.set(redis_key, profile_info_json, 3600)

        return profile_info

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

        query = select(Appointment)

        order_clauses = []
        filter_args = [Appointment.doctor_id == session_user.id]

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
            query.join(Patient)
            .where(*filter_args)
            .options(
                joinedload(Appointment.patient).load_only(
                    Patient.name, Patient.date_of_birth, Patient.gender
                )
            )
            .offset(offset)
            .limit(limit)
        )

        # Count Statement for the distinct (no duplicate) ids of the patients
        count = (
            select(func.count(distinct(Appointment.patient_id)))
            .where(*filter_args)
            .join(Appointment.patient)
            .offset(offset)
            .limit(limit)
        )

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
        result = await db.execute(query)
        filtered_patients = result.scalars().all()

        patients_dict = {}

        # Refactor the patient data for response
        for data in filtered_patients:
            patient_info = data.patient
            patient_id = uuid_to_base64(patient_info.id)
            appointments = {
                "id": uuid_to_base64(data.id),
                "date": data.appointment_date,
            }

            if patient_id not in patients_dict:
                patients_dict[patient_id] = {
                    "id": patient_id,
                    "name": patient_info.name,
                    "gender": patient_info.gender,
                    "date_of_birth": patient_info.date_of_birth,
                    "appointments": [appointments],
                }
            else:
                patients_dict[patient_id]["appointments"].append(appointments)

        patients = list(patients_dict.values())

        count_query = await db.execute(count)
        total = count_query.scalar()

        if no_filter_applied:
            _total = json.dumps(total)
            _patients = json.dumps(jsonable_encoder(patients))
            redis.set(redis_key, _patients, 3600)
            redis.set(redis_key_total, _total, 3600)

        return {"total": total, "patients": patients}

    # Retrieve a list of appointments for a specific doctor
    @staticmethod
    async def get_appointments(
        doctor_id: str,
        session_user: Doctor,
        db: AsyncSession,
        redis: Redis,
        status: int,
        date: str,
        q: str | None,
        page: int,
        limit: int,
    ):
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
        count_query = select(func.count(Appointment.id))

        order_clauses = []
        filter_args = [
            Appointment.doctor_id == session_user.id,
            Appointment.status.not_in(["processing"]),
        ]

        # Handle Searching
        if q:
            filter_args.append(Patient.name.ilike(f"%{q}%"))

        # Sort based on appointment date
        if date in ["latest", "old"]:
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

        # Get to total size of the record stored in the databse
        count_query = (
            count_query.join(Patient).where(*filter_args).offset(offset).limit(limit)
        )

        result = await db.execute(query)
        total_result = await db.execute(count_query)

        filtered_appointments = result.scalars().all()
        total = total_result.scalar()

        appointments = [serialized_appointment(info) for info in filtered_appointments]

        # Store caching into redis
        if cached_data_allowed:
            _total = json.dumps(total)
            _appointments = json.dumps(jsonable_encoder(appointments))
            redis.set(redis_key, _appointments, 3600)
            redis.set(redis_key_total, _total, 3600)

        return {"total": total, "appointments": appointments}

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


# Refactor doctor information
def serialized_doctor(data):
    return {
        "id": uuid_to_base64(data.id),
        **{
            key: val
            for key, val in data.__dict__.items()
            if key != "id"  # Exclude 'id'
        },
    }


# Refactor appointment information
def serialized_appointment(data):
    return {
        "id": uuid_to_base64(data.id),
        **{
            key: val
            for key, val in data.__dict__.items()
            if key
            not in {
                "id",
                "doctor_id",
                "patient_id",
                "patient",
            }  # Exclude 'id', 'doctor_id', 'patient_id', 'patient'
        },
        "patient": {"id": uuid_to_base64(data.patient.id), "name": data.patient.name},
    }


status_priority_map = [
    {
        "upcoming": 1,
        "resheduled": 2,
        "missed": 3,
        "completed": 4,
        "cancelled": 5,
    },
    {
        "resheduled": 1,
        "upcoming": 2,
        "missed": 3,
        "completed": 4,
        "cancelled": 5,
    },
    {
        "missed": 1,
        "resheduled": 2,
        "upcoming": 3,
        "completed": 4,
        "cancelled": 5,
    },
    {
        "completed": 1,
        "missed": 2,
        "resheduled": 3,
        "upcoming": 4,
        "cancelled": 5,
    },
    {
        "cancelled": 1,
        "completed": 2,
        "missed": 3,
        "resheduled": 4,
        "upcoming": 5,
    },
]
