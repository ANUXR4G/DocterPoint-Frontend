import json
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from redis import Redis


from app.core.utils import ResponseHandler
from app.models import Patient, HealthRecord
from app.core.security import base64_to_uuid, uuid_to_base64
from app.schemas.health import (
    HealthRecordUpdate,
)
from app.core.socket import socket_manager


class HealthMonitorings:
    # get health record of patient by id
    @staticmethod
    async def get_health_record_info(
        session_user: Patient, db: AsyncSession, redis: Redis
    ):
        patient_id = uuid_to_base64(session_user.id)  # get the original uuid
        redis_key = f"patients:monitorings:{patient_id}"

        # retrieve health record information from redis if exists
        if cached_health_record := redis.get(redis_key):
            return json.loads(cached_health_record)

        query = select(HealthRecord).where(HealthRecord.patient_id == session_user.id)
        result = await db.execute(query)
        db_health_record = result.scalar_one_or_none()

        if not db_health_record:
            return []  # return empty array

        # restructure the result for general users (e.g, replace ids w base64 strings)
        health_record_info = health_record_data(db_health_record)

        # convert the data into json and set the data into redis caching
        health_record_json = json.dumps(health_record_info)
        redis.set(redis_key, health_record_json, 3600)

        return health_record_info

    # create health record for patient
    @staticmethod
    async def new_health_record(
        new_data: HealthRecordUpdate,
        session_user: Patient,
        db: AsyncSession,
        redis: Redis,
    ):

        # custom error for empty body
        if new_data.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"no field was provided while creating health record.",
            )

        # health_record_data = health_record_data.model_dump(exclude_unset=True)
        payload = {"patient_id": session_user.id, **new_data.none_excluded()}

        # update the bmi if both weight and height was provided
        if new_data.height and new_data.weight:
            height_mtr = new_data.height * 0.3048
            payload["bmi"] = round(new_data.weight / (height_mtr**2), 2)

        new_health_record = HealthRecord(**payload)

        db.add(new_health_record)
        await db.commit()
        await db.refresh(new_health_record)

        # restructure the result for general users (e.g, replace ids w base64 strings)
        health_record_info = health_record_data(new_health_record)

        # get the base64 string for patient uuid
        patient_id = uuid_to_base64(session_user.id)

        # convert the data into json and store it into redis
        redis_key = f"patients:monitorings:{patient_id}"
        health_record_json = json.dumps(health_record_info)
        redis.set(redis_key, health_record_json, 3600)

        # expose the record to websocket room
        await socket_manager.broadcast_to_room(patient_id, health_record_json)

        return health_record_info

    # update health record infromations using health record id
    @staticmethod
    async def update_health_record_by_id(
        updated_data: HealthRecordUpdate,
        record_id: str,
        session_user: Patient,
        db: AsyncSession,
        redis: Redis,
    ):
        health_record_id = base64_to_uuid(record_id)  # get the original uuid

        query = select(HealthRecord).where(HealthRecord.id == health_record_id)
        result = await db.execute(query)
        db_heath_record = result.scalar_one_or_none()

        if not db_heath_record:
            raise ResponseHandler.not_found_error(f"patient health record not found.")

        # raise custom error if no field was provided
        if updated_data.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"no field was provided while updating health record.",
            )

        updated_payload = {"updated_at": func.now(), **updated_data.none_excluded()}

        # update the bmi if both weight and height was provided,
        if updated_data.height and updated_data.weight:
            height_mtr = updated_data.height * 0.3048
            updated_payload["bmi"] = round(updated_data.weight / (height_mtr**2), 2)
        # update the bmi if height aleready exist and weight was provided,
        elif db_heath_record.height and updated_data.weight:
            height_mtr = db_heath_record.height * 0.3048
            updated_payload["bmi"] = round(updated_data.weight / (height_mtr**2), 2)
        # update the bmi if weight aleready exist and height was provided
        elif db_heath_record.weight and updated_data.height:
            height_mtr = db_heath_record.height * 0.3048
            updated_payload["bmi"] = round(db_heath_record.weight / (height_mtr**2), 2)

        for key, value in updated_payload.items():
            setattr(db_heath_record, key, value)

        await db.commit()
        await db.refresh(db_heath_record)

        # restructure the result for general users (e.g, replace ids w base64 strings)
        health_record_info = health_record_data(db_heath_record)

        # get the base64 string for patient uuid
        patient_id = uuid_to_base64(session_user.id)

        # convert the data into json and store it into redis
        redis_key = f"patients:monitorings:{patient_id}"
        health_record_json = json.dumps(health_record_info)
        redis.set(redis_key, health_record_json, 3600)

        # expose the record to websocket room
        await socket_manager.broadcast_to_room(patient_id, health_record_json)

        return health_record_info


def health_record_data(info):
    return {
        "id": uuid_to_base64(info.id),
        "weight": info.weight,
        "height": info.height,
        "blood_group": info.blood_group,
        "smoking_status": info.smoking_status,
        "physical_activity": info.physical_activity,
        "previous_diabetes_records": info.previous_diabetes_records,
        "blood_pressure_records": info.blood_pressure_records,
        "blood_glucose_records": info.blood_glucose_records,
        "body_temperature": info.body_temperature,
        "blood_oxygen": info.blood_oxygen,
        "bmi": info.bmi,
    }
