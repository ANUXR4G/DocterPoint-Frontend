from sqlalchemy import func, select, distinct, and_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import defer
from redis import Redis
import json

from app.models import Hospital
from app.core.utils import ResponseHandler
from app.core.security import uuid_to_base64, base64_to_uuid


class HospitalService:
    # retrieve all the hospital names
    @staticmethod
    async def get_all_names(db: AsyncSession, redis: Redis):
        redis_key = "hospitals:names"
        if cached_hospital_names := redis.get(redis_key):
            return json.loads(cached_hospital_names)

        # get all the unique hospital names
        query = select(distinct(Hospital.name))
        result = await db.execute(query)
        filtered_names = result.scalars().all()

        # set the hospital names into redis
        hospital_names_json = json.dumps(filtered_names)
        redis.set(redis_key, hospital_names_json, 3600)

        return filtered_names

    # retrieve all the hospital locations
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

    # retrieve all hospital informations /general
    @staticmethod
    async def get_all_hospitals(
        db: AsyncSession,
        redis: Redis,
        q: str | None,
        page: int,
        limit: int,
        locations: list[str] | None,
    ):
        """
        Retrieve a list of hospital based on various optional search criteria.

        q: Query parameter for searching hospitals by name (partial matches allowed).
        page: Pagination parameter to specify the starting index of the returned results.
        limit: Pagination parameter to specify the maximum number of results to return.
        locations: Query parameter for filtering hospitals by cities (multiple cities allowed).
        """
        query = select(Hospital)
        count = select(func.count(Hospital.id))

        page = max(1, page)  # allow page only to be greater than 1
        offset = (page - 1) * limit  # calcuate offset based on page and limit
        filter_args = []

        redis_key = f"hospitals:page:{page}"  # redis key for individual pages
        redis_key_total = f"hospitals:total"  # redis key for size of the database

        # load result from redis caching if already stored
        if (
            (cached_hospitals_data := redis.get(redis_key))
            and (cached_total_hospitals := redis.get(redis_key_total))
            and (q is None)
            and (locations is None)
        ):
            total = json.loads(cached_total_hospitals)
            hospitals = json.loads(cached_hospitals_data)
            return {"total": total, "hospitals": hospitals}

        # apply filtering arguments if provided
        if q:
            filter_args.append(Hospital.name.ilike(f"%{q}%"))
        if locations:
            filter_args.append(Hospital.city.in_(locations))

        if filter_args:
            query = query.where(and_(*filter_args))
            # get the total length of filtered records
            statement = count.where(and_(*filter_args))
            count_query = await db.execute(statement)
        else:
            # get the total length of the database
            count_query = await db.execute(count)

        query = (
            query.options(
                defer(Hospital.created_at),  # exclude created_at
                defer(Hospital.updated_at),  # exclude updated_at
            )
            .offset(offset)
            .limit(limit)
        )

        # retrieve all the doctor informations
        result = await db.execute(query)
        filtered_hospitals = result.scalars().all()

        # restructure doctor data from the result
        filtered_hospitals = jsonable_encoder(
            [hospital_data(hospital) for hospital in filtered_hospitals]
        )

        # get the total length of the database
        total = count_query.scalar()

        # store doctors information into redis if no filtering args was applied
        if not q and not locations:
            total_hospital_json = json.dumps(total)
            hospitals_data_json = json.dumps(filtered_hospitals)
            redis.set(redis_key_total, total_hospital_json, 3600)
            redis.set(redis_key, hospitals_data_json, 3600)

        return {"total": total, "hospitals": filtered_hospitals}

    @staticmethod
    async def get_hospital_by_id(hospital_id: str, db: AsyncSession, redis: Redis):
        """
        hospital_id: Query parameter for filtering hospital by hospital id.
        """
        hospital_id_uuid = base64_to_uuid(hospital_id)  # covert base64 string to uuid
        redis_key = f"hospitals:info:{hospital_id}"  # set keys dynamically

        # load result from redis caching if already stored
        if cached_hospital_data := redis.get(redis_key):
            return json.loads(cached_hospital_data)

        query = (
            select(Hospital)
            .where(Hospital.id == hospital_id_uuid)
            .options(
                defer(Hospital.created_at),  # exclude created_at
                defer(Hospital.updated_at),  # exclude updated_at
            )
        )

        # retrieve the hospital information
        result = await db.execute(query)
        hospital_info_data = result.scalar_one_or_none()

        if not hospital_info_data:
            raise ResponseHandler.not_found_error(f"hospital not found {hospital_id}")

        # restructure hospital data from the result
        hospital_info = hospital_data(hospital_info_data)

        # store doctor information into redis for caching
        hospital_info_json = json.dumps(jsonable_encoder(hospital_info))
        redis.set(redis_key, hospital_info_json, 3600)

        return hospital_info


def hospital_data(hospital: Hospital):
    return {
        "id": uuid_to_base64(hospital.id),
        **{
            key: val
            for key, val in hospital.__dict__.items()
            if key != "id"  # exclude 'id'
        },
    }
