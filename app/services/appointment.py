from sqlalchemy import select, func, or_, desc, case
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import HTTPException
from redis import Redis
from datetime import datetime
import json

from app.models import Patient, Appointment, Doctor, Hospital
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate
from app.core.security import base64_to_uuid, uuid_to_base64
from app.core.utils import ResponseHandler


# upcoming appointment util function for redis
def get_data_from_redis(redis: Redis, redis_key: str):
    if cached_result := redis.get(redis_key):
        return json.loads(cached_result)


class AppointmentService:
    # create a new appointment /patient
    @staticmethod
    async def new_appointment(
        appointment: AppointmentCreate,
        session_user: Patient,
        db: AsyncSession,
        redis: Redis,
    ):
        appointment.doctor_id = base64_to_uuid(appointment.doctor_id)

        # get the next serial number
        serial_number = (
            await db.execute(select(func.max(Appointment.serial_number)))
        ).scalar()

        payload = {
            "patient_id": session_user.id,
            "serial_number": (serial_number or 0) + 1,
            **appointment.none_excluded(),
        }

        db_appointment = Appointment(**payload)
        db.add(db_appointment)
        await db.commit()
        await db.refresh(db_appointment)

        query = (
            select(Appointment)
            .where(Appointment.id == db_appointment.id)
            .options(
                joinedload(Appointment.doctor)
                .load_only(Doctor.name)
                .joinedload(Doctor.hospital)
                .load_only(Hospital.name, Hospital.address)
            )
        )

        result = await db.execute(query)
        appointment_info = result.scalar_one_or_none()

        if not appointment_info:
            HTTPException(400, f"something went wrong while creating new appointment.")

        # restructure the result for general users (e.g, replace ids w base64 strings)
        new_appointment_data = appointment_data(appointment_info)

        patient_appointments_key = (
            f"patients:appointments:{uuid_to_base64(appointment_info.patient_id)}"
        )

        # store the appointment information into redis caching
        appointment_data_json = json.dumps(jsonable_encoder(new_appointment_data))
        redis.set(
            f"{patient_appointments_key}:{uuid_to_base64(appointment_info.id)}",
            appointment_data_json,
            3600,
        )

        # delete previous stored appointment records from the cache
        count_key = f"{patient_appointments_key}:total"
        upcoming_key = f"{patient_appointments_key}:upcoming"
        redis_keys = redis.keys(f"{patient_appointments_key}:page:*")
        redis_keys.extend([count_key, upcoming_key])

        if redis_keys:
            redis.delete(*redis_keys)

        return new_appointment_data

    # retrieve appointment details /patient
    @staticmethod
    async def get_appointment_by_id(
        id: str, session_user: Patient, db: AsyncSession, redis: Redis
    ):
        appointment_id = base64_to_uuid(id)
        redis_key = f"patients:appointments:{uuid_to_base64(session_user.id)}:{id}"

        # retrieve appointment information from redis if exists
        if cached_appointment_info := redis.get(redis_key):
            return json.loads(cached_appointment_info)

        # query the appointment data w specific info
        query = (
            select(Appointment)
            .where(Appointment.id == appointment_id)
            .options(
                joinedload(Appointment.doctor)
                .load_only(Doctor.name)
                .joinedload(Doctor.hospital)
                .load_only(Hospital.name, Hospital.address)
            )
        )

        result = await db.execute(query)
        appointment_info = result.scalar_one_or_none()

        # handle appointment info not found
        if not appointment_info:
            raise ResponseHandler.not_found_error(f"failed to retrieve appointment.")

        # restructure the result for general users (e.g, replace ids w base64 strings)
        appointment_info_data = appointment_data(appointment_info)

        # convert the data into json and set the data into redis caching
        appointment_data_json = json.dumps(jsonable_encoder(appointment_info_data))
        redis.set(
            redis_key,
            appointment_data_json,
            3600,
        )

        return appointment_info_data

    # get all the upcoming appointments /patient
    @staticmethod
    async def get_upcoming_appointments(
        session_user: Patient, db: AsyncSession, redis: Redis
    ):
        upcoming_key = (
            f"patients:appointments:{uuid_to_base64(session_user.id)}:upcoming"
        )
        cached_upcoming_appointments = get_data_from_redis(redis, upcoming_key)
        if cached_upcoming_appointments:
            return cached_upcoming_appointments

        # query the upcoming n rescheduled appointment data w specific details
        query = (
            select(Appointment)
            .where(
                Appointment.patient_id == session_user.id,
                Appointment.status.in_(["upcoming", "rescheduled"]),
            )
            .options(
                joinedload(Appointment.doctor)
                .load_only(Doctor.name)
                .joinedload(Doctor.hospital)
                .load_only(Hospital.name, Hospital.address)
            )
            .order_by(
                Appointment.appointment_date,
            )
        )

        result = await db.execute(query)
        upcoming_appointments = result.scalars().all()

        # restructure the result for general users (e.g, replace ids w base64 strings)
        upcoming_appointments_data = [
            appointment_data(appointment) for appointment in upcoming_appointments
        ]

        # store upcoming appointments into redis
        upcoming_appointments_json = json.dumps(
            jsonable_encoder(upcoming_appointments_data)
        )
        redis.set(upcoming_key, upcoming_appointments_json, 3600)

        return upcoming_appointments_data

    async def get_all_appointments(
        q: str | None,
        page: int,
        limit: int,
        patient: Patient,
        db: AsyncSession,
        redis: Redis,
    ):
        """
        Retrieve a list of appointments based on various optional search criteria.

        q: Query parameter for searching appointments by name, hospital, doctor (partial matches allowed).
        page: Pagination parameter to specify the starting index of the returned results.
        limit: Pagination parameter to specify the maximum number of results to return.
        """
        query = select(Appointment)
        count = (
            select(func.count(Appointment.id))
            .where(Appointment.patient_id == patient.id)
            .join(Appointment.doctor)
            .join(Doctor.hospital)
        )

        page = max(1, page)  # allow page only to be greater than 1
        offset = (page - 1) * limit  # calcuate offset based on page and limit

        filter_args = []

        patient_appointments_key = f"patients:appointments:{uuid_to_base64(patient.id)}"
        redis_key = f"{patient_appointments_key}:page:{page}"
        redis_key_total = f"{patient_appointments_key}:total"

        # load result from redis caching if already stored
        if (
            (cached_appointments := redis.get(redis_key))
            and (cached_appointments_total := redis.get(redis_key_total))
            and (q is None)
        ):
            total = json.loads(cached_appointments_total)
            appointments = json.loads(cached_appointments)
            return {"total": total, "appointments": appointments}

        # apply filtering arguments if provided (q, experience, hospitals, locations)
        if q:
            filter_args.append(Doctor.name.ilike(f"%{q}%"))
            filter_args.append(Hospital.name.ilike(f"%{q}%"))
            filter_args.append(Hospital.city.ilike(f"%{q}%"))
            filter_args.append(Hospital.address.ilike(f"%{q}%"))

        # filter out the query and the count of the query based on condition
        if filter_args:
            query = (
                query.where(or_(*filter_args))
                .join(Appointment.doctor)
                .join(Doctor.hospital)
            )

            statement = count.where(or_(*filter_args))
            count_query = await db.execute(statement)
        else:
            count_query = await db.execute(count)

        status_priority = {
            "upcoming": 1,
            "resheduled": 2,
            "missed": 3,
            "completed": 4,
            "cancelled": 5,
        }

        status_order = case(
            (Appointment.status == "upcoming", status_priority["upcoming"]),
            (Appointment.status == "resheduled", status_priority["resheduled"]),
            (Appointment.status == "missed", status_priority["missed"]),
            (Appointment.status == "completed", status_priority["completed"]),
            (Appointment.status == "cancelled", status_priority["cancelled"]),
            else_=5,
        )

        query = (
            query.where(Appointment.patient_id == patient.id)
            .options(
                joinedload(Appointment.doctor)
                .load_only(Doctor.name)
                .joinedload(Doctor.hospital)
                .load_only(Hospital.name, Hospital.address)
            )
            .order_by(
                status_order,
                Appointment.appointment_date,
            )
            .offset(offset)
            .limit(limit)
        )

        result = await db.execute(query)
        filtered_appointments = result.scalars().all()

        # restructure the result for general users (e.g, replace ids w base64 strings)
        filtered_appointments = jsonable_encoder(
            [appointment_data(appointment) for appointment in filtered_appointments]
        )

        # get the total length of the database
        total = count_query.scalar()

        if not q:
            total_appointment = json.dumps(total)
            appointments_data_json = json.dumps(filtered_appointments)
            redis.set(redis_key_total, total_appointment, 3600)
            redis.set(redis_key, appointments_data_json, 3600)

        return {"total": total, "appointments": filtered_appointments}

    async def update_appointment_by_id(
        appointment_id: str,
        updated_data: AppointmentUpdate,
        db: AsyncSession,
        redis: Redis,
    ):
        appointment_id_uuid = base64_to_uuid(appointment_id)

        query = select(Appointment).where(Appointment.id == appointment_id_uuid)
        result = await db.execute(query)
        db_appointment = result.scalar_one_or_none()

        if not db_appointment:
            raise ResponseHandler.not_found_error(
                f"failed to update, appointment not found."
            )

        if db_appointment.status in ["completed", "missed", "cancelled"]:
            raise ResponseHandler.no_permission(
                f"updating this appointment is not allowed."
            )

        if updated_data.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"failed to update, no data was provided",
            )

        # remove all the None valued keys and update update_at
        updated_data = updated_data.model_dump(exclude_unset=True)
        updated_data["updated_at"] = func.now()

        for key, value in updated_data.items():
            setattr(db_appointment, key, value)

        await db.commit()
        await db.refresh(db_appointment)

        query = (
            select(Appointment)
            .where(Appointment.id == db_appointment.id)
            .options(
                joinedload(Appointment.doctor)
                .load_only(Doctor.name)
                .joinedload(Doctor.hospital)
                .load_only(Hospital.name, Hospital.address)
            )
        )

        result = await db.execute(query)
        appointment_info = result.scalar_one_or_none()

        if not appointment_info:
            HTTPException(
                400, f"something went wrong while retrieving newly appointment."
            )

        # restructure the result for general users (e.g, replace ids w base64 strings)
        updated_appointment_data = appointment_data(appointment_info)

        patient_appointments_key = (
            f"patients:appointments:{uuid_to_base64(appointment_info.patient_id)}"
        )

        # store the appointment information into redis caching
        appointment_data_json = json.dumps(jsonable_encoder(updated_appointment_data))
        redis.set(
            f"{patient_appointments_key}:{appointment_id}",
            appointment_data_json,
            3600,
        )

        # delete previous stored appointment records from the cache
        count_key = f"{patient_appointments_key}:total"
        upcoming_key = f"{patient_appointments_key}:upcoming"
        redis_keys = redis.keys(f"{patient_appointments_key}:page:*")
        redis_keys.extend([count_key, upcoming_key])

        if redis_keys:
            redis.delete(*redis_keys)

        return updated_appointment_data


# restructure the result for general users (e.g, replace ids w base64 strings)
def appointment_data(appointment_info: Appointment):
    return {
        "id": uuid_to_base64(appointment_info.id),
        "serial_number": appointment_info.serial_number,
        "mode": appointment_info.mode,
        "type": appointment_info.type,
        "status": appointment_info.status,
        "appointment_date": appointment_info.appointment_date,
        "appointment_time": appointment_info.appointment_time,
        "purpose_of_visit": appointment_info.purpose_of_visit,
        "test_name": appointment_info.test_name,
        "referred_by": appointment_info.referred_by,
        "doctor": {
            "id": uuid_to_base64(appointment_info.doctor.id),
            "name": appointment_info.doctor.name,
        },
        "hospital": {
            "id": uuid_to_base64(appointment_info.doctor.hospital.id),
            "name": appointment_info.doctor.hospital.name,
            "address": appointment_info.doctor.hospital.address,
        },
        "patient_note": appointment_info.patient_note,
        "doctor_note": appointment_info.doctor_note,
    }
