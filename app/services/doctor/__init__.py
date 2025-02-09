import json
from redis import Redis

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, cast, distinct, Date
from sqlalchemy.orm import defer, joinedload

from fastapi.encoders import jsonable_encoder

from app.models import Doctor, Appointment, Patient
from app.core.security import (
    uuid_to_base64,
)
from app.core.utils import ResponseHandler


class DoctorService:
    @staticmethod
    async def get_info(session_user: Doctor, db: AsyncSession, redis: Redis):
        """
        Retrieve information of a specific doctor based on the current session.

        Parameters:
        -----------
        session_user: The currently logged-in doctor (session user).
        db: The database session for executing SQL queries asynchronously.
        redis: The Redis instance for caching purposes.


        Returns:
        --------
            Information of the specific doctor.
        """

        doctor_id = uuid_to_base64(session_user.id)
        redis_key = f"users:doctor:{doctor_id}:info"

        # Return cache if exists
        if cached_doctor_info := redis.get(redis_key):
            return json.loads(cached_doctor_info)

        query = (
            select(Doctor)
            .where(Doctor.id == session_user.id)
            .options(
                defer(Doctor.password),  # exclude password
                defer(Doctor.created_by),  # exclude created_by
                defer(Doctor.created_at),  # exclude created_at
                defer(Doctor.updated_at),  # exclude updated_at
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
        """
        Retrieve a list of appointed patients to a doctor by doctor_id.

        Parameters:
        -----------
        doctor_id: The ID of the doctor for whom the appointments are to be retrieved.
        session_user: The currently logged-in doctor (session user).
        db: The database session for executing SQL queries asynchronously.
        redis: The Redis instance for caching purposes.
        q: The search query to filter patients by name (case-insensitive).
        age: The age filter to sort patients by age. Values can be "young" or "old".
        gender: The gender filter to sort patients by gender. Values can be "male" or "female".
        page : The page number for pagination.
        limit : The maximum number of patients to retrieve per page.

        Returns:
        --------
            total: The total number of retrieve data based on the requirements.
            patients: A list containing the patient information and appointment details.

        """

        redis_key = f"users:doctor:{doctor_id}:patients"
        redis_key_total = f"users:doctor:{doctor_id}:patients:total"

        page = max(1, page)
        offset = (page - 1) * limit

        query = select(Appointment)

        order_clauses = []
        filter_args = [
            Appointment.doctor_id == session_user.id,
            Appointment.status.not_in(["upcoming"]),
        ]

        no_filter_applied = not q and not age and not gender

        # Retrieve doctor's appointed patients information from redis if exists
        if (
            (cached_patients_info := redis.get(redis_key))
            and (cached_total := redis.get(redis_key_total))
            and no_filter_applied
        ):
            return {
                "msg": "from redis",
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


# Refactor doctor information
def serialized_doctor(data):
    return {
        "id": uuid_to_base64(data.id),
        **{
            key: val
            for key, val in data.__dict__.items()
            if key != "id"  # exclude 'id'
        },
    }
