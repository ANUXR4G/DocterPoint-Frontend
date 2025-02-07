from redis import Redis

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import defer

from fastapi.encoders import jsonable_encoder


from app.models import Doctor
from app.core.security import (
    uuid_to_base64,
    decrypt,
    verify_password,
    generate_hash,
)
from app.core.utils import ResponseHandler


import json


class InfoService:
    @staticmethod
    async def get_info(session_user: Doctor, db: AsyncSession, redis: Redis):
        doctor_id = uuid_to_base64(session_user.id)
        redis_key = f"doctors:profile:info:{doctor_id}"

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
        profile_info = serialized_profile(db_profile_info)

        # Convert the data into json and set the data into redis caching
        profile_info_json = json.dumps(jsonable_encoder(profile_info))
        redis.set(redis_key, profile_info_json, 3600)

        return profile_info


# Refactor user information
def serialized_profile(data):
    return {
        "id": uuid_to_base64(data.id),
        **{
            key: val
            for key, val in data.__dict__.items()
            if key != "id"  # exclude 'id'
        },
    }
