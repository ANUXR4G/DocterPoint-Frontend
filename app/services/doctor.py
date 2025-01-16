from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import joinedload, defer
from redis import Redis
import json

from app.core.utils import ResponseHandler
from app.models import Doctor, Hospital
from app.core.security import uuid_to_base64, base64_to_uuid


class DoctorService:
    # retrieve all doctor informations
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
        """
        q: Query parameter for searching doctors by name (partial matches allowed).
        page: Pagination parameter to specify the starting index of the returned results.
        limit: Pagination parameter to specify the maximum number of results to return.
        hospitals: Query parameter for filtering doctors by hospital names (multiple hospitals allowed).
        locations: Query parameter for filtering doctors by cities (multiple cities allowed).
        experience: Query parameter for filtering doctors by minimum years of experience.
        """
        query = select(Doctor)
        count = select(func.count(Doctor.id))

        page = max(1, page)  # allow page only to be greater than 1
        offset = (page - 1) * limit  # calcuate offset based on page and limit
        filter_args = []

        redis_key = f"doctors:page:{page}"  # redis key for individual pages
        redis_key_total = f"doctors:total"  # redis key for size of the database

        # load result from redis caching if already stored (only when filtering is not being applied)
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

        # apply filtering arguments if provided (q, experience, hospitals, locations)
        if q:
            filter_args.append(Doctor.name.ilike(f"%{q}%"))
        if experience:
            filter_args.append(Doctor.experience >= experience)
        if hospitals:
            filter_args.append(Hospital.name.in_(hospitals))
        if locations:
            filter_args.append(Hospital.city.in_(locations))

        # filter out the query and the count of the query based on condition
        if filter_args:
            query = query.where(or_(*filter_args))
            # get the total length of filtered records
            statement = count.where(or_(*filter_args)).join(Hospital)
            count_query = await db.execute(statement)
        else:
            count_query = await db.execute(count)

        query = (
            query.join(Hospital)
            .options(
                defer(Doctor.password),  # exclude password
                defer(Doctor.created_at),  # exclude created_at
                defer(Doctor.updated_at),  # exclude updated_at
                defer(Doctor.role),  # exclude user role
                defer(Doctor.hospital_id),  # exclude hospital_id
                joinedload(Doctor.hospital).load_only(
                    Hospital.name,  # include name,
                    Hospital.city,  # include city
                    Hospital.address,  # include address
                ),
            )
            .offset(offset)
            .limit(limit)
        )

        # retrieve all the doctor informations
        result = await db.execute(query)
        filtered_doctors = result.scalars().all()

        # restructure doctor data from the result
        filtered_doctors = jsonable_encoder(
            [doctor_data(doctor) for doctor in filtered_doctors]
        )

        # get the total length of the database
        total = count_query.scalar()

        # store doctors information into redis if no filtering args was applied
        if not q and not hospitals and not locations and not experience:
            total_doctors_json = json.dumps(total)
            doctors_data_json = json.dumps(filtered_doctors)
            redis.set(redis_key_total, total_doctors_json, 3600)
            redis.set(redis_key, doctors_data_json, 3600)

        return {"total": total, "doctors": filtered_doctors}

    # retrieve specific doctor information
    @staticmethod
    async def get_doctor_by_id(doctor_id: str, db: AsyncSession, redis: Redis):
        """
        id: Query parameter for filtering doctors by doctor ids.
        """
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
                defer(Doctor.password),  # exclude password
                defer(Doctor.created_at),  # exclude created_at
                defer(Doctor.updated_at),  # exclude updated_at
                defer(Doctor.role),  # exclude user role
                defer(Doctor.hospital_id),  # exclude hospital_id
                joinedload(Doctor.hospital).load_only(
                    Hospital.name,  # include name,
                    Hospital.city,  # include city
                    Hospital.address,  # include address
                ),
            )
        )

        # retrieve the doctor information
        result = await db.execute(query)
        doctor_info_data = result.scalar_one_or_none()

        if not doctor_info_data:
            raise ResponseHandler.not_found_error(f"doctor not found")

        # restructure doctor data from the result
        doctor_info = doctor_data(doctor_info_data)

        # store doctor information into redis for caching
        doctors_info_json = json.dumps(jsonable_encoder(doctor_info))
        redis.set(redis_key, doctors_info_json, 3600)

        return doctor_info

    # retrieve all doctor informations
    @staticmethod
    async def get_doctors_by_hospital_id(
        hospital_id: str,
        db: AsyncSession,
        redis: Redis,
        page: int,
        limit: int,
    ):
        """
        hospital_id: Query parameter for filtering all the doctors by their hospital ids.
        page: Pagination parameter to specify the starting index of the returned results.
        limit: Pagination parameter to specify the maximum number of results to return.
        """
        hospital_id_uuid = base64_to_uuid(hospital_id)
        count = select(func.count(Doctor.id)).where(
            Doctor.hospital_id == hospital_id_uuid
        )

        page = max(1, page)  # allow page only to be greater than 1
        offset = (page - 1) * limit  # calcuate offset based on page and limit

        redis_key = f"doctors:hospital:{hospital_id}:page:{page}"  # redis key for individual pages
        redis_key_total = f"doctors:hospital:{hospital_id}:total"  # redis key for size of the database

        # load result from redis caching if already stored
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
                defer(Doctor.password),  # exclude password
                defer(Doctor.created_at),  # exclude created_at
                defer(Doctor.updated_at),  # exclude updated_at
                defer(Doctor.role),  # exclude user role
                defer(Doctor.hospital_id),  # exclude hospital_id
                joinedload(Doctor.hospital).load_only(
                    Hospital.name,  # include name,
                    Hospital.city,  # include city
                    Hospital.address,  # include address
                ),
            )
            .offset(offset)
            .limit(limit)
        )

        # get the total length of the database
        count_query = await db.execute(count)
        total = count_query.scalar()

        # retrieve all the doctor informations
        result = await db.execute(query)
        filtered_doctors = result.scalars().all()

        # restructure doctor data from the result
        filtered_doctors = jsonable_encoder(
            [doctor_data(doctor) for doctor in filtered_doctors]
        )

        # store doctors information into redis if no filtering args was applied
        total_doctors_json = json.dumps(total)
        doctors_data_json = json.dumps(filtered_doctors)
        redis.set(redis_key_total, total_doctors_json, 3600)
        redis.set(redis_key, doctors_data_json, 3600)

        return {"total": total, "doctors": filtered_doctors}


def doctor_data(doctor):
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
            }  # exclude 'id' and 'hospital'
        },
    }
