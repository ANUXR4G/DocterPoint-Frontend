from sqlalchemy import func, select, or_, and_, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import joinedload, defer
from redis import Redis
import json

from app.core.utils import ResponseHandler
from app.models import Doctor, Hospital
from app.core.security import uuid_to_base64, base64_to_uuid


class DoctorService:
    # Retrieve a list of doctors based on various search criteria.
    @staticmethod
    async def get_all_doctors(
        db: AsyncSession,
        redis: Redis,
        q: str | None,
        page: int,
        limit: int,
        hospitals: list[str] | None,
        locations: list[str] | None,
        experience: int | None,
    ):
        query = select(Doctor)
        count = select(func.count(Doctor.id))

        page = max(1, page)  # Allow page only to be greater than 1
        offset = (page - 1) * limit  # Calcuate offset based on page and limit
        filter_args = []

        redis_key = f"doctors:page:{page}"  # Redis key for individual pages
        redis_key_total = f"doctors:total"  # Redis key for size of the database

        # Load result from redis caching if already stored (only when filtering is not being applied)
        if (
            (cached_doctors_data := redis.get(redis_key))
            and (cached_total_doctors := redis.get(redis_key_total))
            and (q is None)
            and (hospitals is None)
            and (locations is None)
            and (experience is None)
        ):
            total = json.loads(cached_total_doctors)
            doctors = json.loads(cached_doctors_data)
            return {"total": total, "doctors": doctors}

        # Apply filtering arguments if provided (q, experience, hospitals, locations)
        if q:
            filter_args.append(Doctor.name.ilike(f"%{q}%"))
        if experience:
            filter_args.append(Doctor.experience >= experience)
        if hospitals:
            filter_args.append(Hospital.name.in_(hospitals))
        if locations:
            filter_args.append(Hospital.city.in_(locations))

        # Filter out the query and the count of the query based on condition
        if filter_args:
            query = query.where(or_(*filter_args))
            # Get the total length of filtered records
            statement = count.where(or_(*filter_args)).join(Hospital)
            count_query = await db.execute(statement)
        else:
            count_query = await db.execute(count)

        query = (
            query.join(Hospital)
            .options(
                defer(Doctor.password),  # Exclude password
                defer(Doctor.created_at),  # Exclude created_at
                defer(Doctor.updated_at),  # Exclude updated_at
                defer(Doctor.role),  # Exclude user role
                defer(Doctor.hospital_id),  # Exclude hospital_id
                joinedload(Doctor.hospital).load_only(
                    Hospital.name,  # Include name
                    Hospital.city,  # Include city
                    Hospital.address,  # Include address
                ),
            )
            .offset(offset)
            .limit(limit)
        )

        # Retrieve all the doctor informations
        result = await db.execute(query)
        filtered_doctors = result.scalars().all()

        # Restructure doctor data from the result
        filtered_doctors = jsonable_encoder(
            [serialized_doctor(doctor) for doctor in filtered_doctors]
        )

        # Get the total length of the database
        total = count_query.scalar()

        # Store doctors information into redis if no filtering args was applied
        if not q and not hospitals and not locations and not experience:
            total_doctors_json = json.dumps(total)
            doctors_data_json = json.dumps(filtered_doctors)
            redis.set(redis_key_total, total_doctors_json, 3600)
            redis.set(redis_key, doctors_data_json, 3600)

        return {"total": total, "doctors": filtered_doctors}

    # Retrieve a doctor's information by their ID.
    @staticmethod
    async def get_doctor_by_id(doctor_id: str, db: AsyncSession, redis: Redis):
        doctor_id_uuid = base64_to_uuid(doctor_id)  # covert base64 string to uuid
        redis_key = f"doctors:info:{doctor_id}"  # redis key for specific doctor

        # load result from redis caching if already stored
        if cached_doctor_data := redis.get(redis_key):
            return json.loads(cached_doctor_data)

        query = (
            select(Doctor)
            .where(Doctor.id == doctor_id_uuid)
            .join(Hospital)
            .options(
                defer(Doctor.password),  # Exclude password
                defer(Doctor.created_at),  # Exclude created_at
                defer(Doctor.updated_at),  # Exclude updated_at
                defer(Doctor.role),  # Exclude user role
                defer(Doctor.hospital_id),  # Exclude hospital_id
                joinedload(Doctor.hospital).load_only(
                    Hospital.name,  # Include name,
                    Hospital.city,  # Include city
                    Hospital.address,  # Include address
                ),
            )
        )

        # Retrieve the doctor information
        result = await db.execute(query)
        doctor_info_data = result.scalar_one_or_none()

        if not doctor_info_data:
            raise ResponseHandler.not_found_error(f"doctor not found")

        # Restructure doctor data from the result
        doctor_info = serialized_doctor(doctor_info_data)

        # Store doctor information into redis for caching
        doctors_info_json = json.dumps(jsonable_encoder(doctor_info))
        redis.set(redis_key, doctors_info_json, 3600)

        return doctor_info

    # Retrieve a list of doctors associated with a specific hospital by hospital ID.
    @staticmethod
    async def get_doctors_by_hospital_id(
        hospital_id: str,
        db: AsyncSession,
        redis: Redis,
        page: int,
        limit: int,
    ):
        hospital_id_uuid = base64_to_uuid(hospital_id)
        count = select(func.count(Doctor.id)).where(
            Doctor.hospital_id == hospital_id_uuid
        )

        page = max(1, page)  # Allow page only to be greater than 1
        offset = (page - 1) * limit  # Calcuate offset based on page and limit

        redis_key = f"doctors:hospital:{hospital_id}:page:{page}"  # Redis key for individual pages
        redis_key_total = f"doctors:hospital:{hospital_id}:total"  # Redis key for size of the database

        # Load result from redis caching if already stored
        if (cached_doctors_data := redis.get(redis_key)) and (
            (cached_total_doctors := redis.get(redis_key_total))
        ):
            total = json.loads(cached_total_doctors)
            result = json.loads(cached_doctors_data)
            return {"total": total, "doctors": result}

        query = (
            select(Doctor)
            .where(Doctor.hospital_id == hospital_id_uuid)
            .join(Hospital)
            .options(
                defer(Doctor.password),  # Exclude password
                defer(Doctor.created_at),  # Exclude created_at
                defer(Doctor.updated_at),  # Exclude updated_at
                defer(Doctor.role),  # Exclude user role
                defer(Doctor.hospital_id),  # Exclude hospital_id
                joinedload(Doctor.hospital).load_only(
                    Hospital.name,  # Exclude name,
                    Hospital.city,  # Exclude city
                    Hospital.address,  # Exclude address
                ),
            )
            .offset(offset)
            .limit(limit)
        )

        # Get the total length of the database
        count_query = await db.execute(count)
        total = count_query.scalar()

        # Retrieve all the doctor informations
        result = await db.execute(query)
        filtered_doctors = result.scalars().all()

        # Restructure doctor data from the result
        filtered_doctors = jsonable_encoder(
            [serialized_doctor(doctor) for doctor in filtered_doctors]
        )

        # Store doctors information into redis if no filtering args was applied
        total_doctors_json = json.dumps(total)
        doctors_data_json = json.dumps(filtered_doctors)
        redis.set(redis_key_total, total_doctors_json, 3600)
        redis.set(redis_key, doctors_data_json, 3600)

        return {"total": total, "doctors": filtered_doctors}


class HospitalService:
    @staticmethod
    # Retrieve the list of hospital names.
    async def get_all_names(db: AsyncSession, redis: Redis):
        redis_key = "hospitals:names"

        if cached_hospital_names := redis.get(redis_key):
            return json.loads(cached_hospital_names)

        # Get all the unique hospital names
        query = select(distinct(Hospital.name))
        result = await db.execute(query)
        filtered_names = result.scalars().all()

        # Set the hospital names into redis
        hospital_names_json = json.dumps(filtered_names)
        redis.set(redis_key, hospital_names_json, 3600)

        return filtered_names

    # Retrieve the list of hospital locations.
    @staticmethod
    async def get_all_locations(db: AsyncSession, redis: Redis):
        redis_key = "hospitals:locations"
        if cached_hospital_locations := redis.get(redis_key):
            return json.loads(cached_hospital_locations)

        # get all the unique hospital loctions
        query = select(distinct(Hospital.city))
        result = await db.execute(query)
        filtered_locations = result.scalars().all()

        # set the hospital locations into redis
        hospital_locations_json = json.dumps(filtered_locations)
        redis.set(redis_key, hospital_locations_json, 3600)

        return filtered_locations

    # Retrieve a list of hospitals based on various search criteria.
    @staticmethod
    async def get_all_hospitals(
        db: AsyncSession,
        redis: Redis,
        q: str | None,
        page: int,
        limit: int,
        locations: list[str] | None,
    ):
        query = select(Hospital)
        count = select(func.count(Hospital.id))

        page = max(1, page)  # Allow page only to be greater than 1
        offset = (page - 1) * limit  # Calcuate offset based on page and limit
        filter_args = []

        redis_key = f"hospitals:page:{page}"  # Redis key for individual pages
        redis_key_total = f"hospitals:total"  # Redis key for size of the database

        # Load result from redis caching if already stored
        if (
            (cached_hospitals_data := redis.get(redis_key))
            and (cached_total_hospitals := redis.get(redis_key_total))
            and (q is None)
            and (locations is None)
        ):
            total = json.loads(cached_total_hospitals)
            hospitals = json.loads(cached_hospitals_data)
            return {"total": total, "hospitals": hospitals}

        # Apply filtering arguments if provided
        if q:
            filter_args.append(Hospital.name.ilike(f"%{q}%"))
        if locations:
            filter_args.append(Hospital.city.in_(locations))

        if filter_args:
            query = query.where(and_(*filter_args))
            # Get the total length of filtered records
            statement = count.where(and_(*filter_args))
            count_query = await db.execute(statement)
        else:
            # Get the total length of the database
            count_query = await db.execute(count)

        query = (
            query.options(
                defer(Hospital.created_at),  # Exclude created_at
                defer(Hospital.updated_at),  # Exclude updated_at
            )
            .offset(offset)
            .limit(limit)
        )

        # Retrieve all the doctor informations
        result = await db.execute(query)
        filtered_hospitals = result.scalars().all()

        # Restructure doctor data from the result
        filtered_hospitals = jsonable_encoder(
            [serialized_hospital(hospital) for hospital in filtered_hospitals]
        )

        # Get the total length of the database
        total = count_query.scalar()

        # Store doctors information into redis if no filtering args was applied
        if not q and not locations:
            total_hospital_json = json.dumps(total)
            hospitals_data_json = json.dumps(filtered_hospitals)
            redis.set(redis_key_total, total_hospital_json, 3600)
            redis.set(redis_key, hospitals_data_json, 3600)

        return {"total": total, "hospitals": filtered_hospitals}

    # Retrieve a hospital's information by its ID.
    @staticmethod
    async def get_hospital_by_id(hospital_id: str, db: AsyncSession, redis: Redis):
        hospital_id_uuid = base64_to_uuid(hospital_id)  # Covert base64 string to uuid
        redis_key = f"hospitals:info:{hospital_id}"  # Set keys dynamically

        # Load result from redis caching if already stored
        if cached_hospital_data := redis.get(redis_key):
            return json.loads(cached_hospital_data)

        query = (
            select(Hospital)
            .where(Hospital.id == hospital_id_uuid)
            .options(
                defer(Hospital.created_at),  # Exclude created_at
                defer(Hospital.updated_at),  # Exclude updated_at
            )
        )

        # Retrieve the hospital information
        result = await db.execute(query)
        hospital_info_data = result.scalar_one_or_none()

        if not hospital_info_data:
            raise ResponseHandler.not_found_error(f"hospital not found {hospital_id}")

        # Restructure hospital data from the result
        hospital_info = serialized_hospital(hospital_info_data)

        # Store doctor information into redis for caching
        hospital_info_json = json.dumps(jsonable_encoder(hospital_info))
        redis.set(redis_key, hospital_info_json, 3600)

        return hospital_info


def serialized_hospital(hospital: Hospital):
    return {
        "id": uuid_to_base64(hospital.id),
        **{
            key: val
            for key, val in hospital.__dict__.items()
            if key != "id"  # Exclude 'id'
        },
    }


def serialized_doctor(doctor: Doctor):
    return {
        "id": uuid_to_base64(doctor.id),
        "hospital": {
            "id": uuid_to_base64(doctor.hospital.id),
            "name": doctor.hospital.name,
            "city": doctor.hospital.city,
            "address": doctor.hospital.address,
        },
        **{
            key: val
            for key, val in doctor.__dict__.items()
            if key
            not in {
                "id",
                "hospital",
            }  # Exclude 'id' and 'hospital'
        },
    }
