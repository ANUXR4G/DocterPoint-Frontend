import json
from redis import Redis
from sqlalchemy import func, select

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User, Patient
from app.core.utils import ResponseHandler
from app.core.security import (
    uuid_to_base64,
    decrypt,
    verify_password,
    generate_hash,
)
from app.schemas.users import (
    UserUpdate,
    UserPasswordChange,
)
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import defer


class PatientService:
    @staticmethod
    async def get_profile_info(session_user: Patient, db: AsyncSession, redis: Redis):
        patient_id = uuid_to_base64(session_user.id)
        redis_key = f"patients:info:{patient_id}"

        if cached_patient_info := redis.get(redis_key):
            return json.loads(cached_patient_info)

        query = (
            select(Patient)
            .where(Patient.id == session_user.id)
            .options(
                defer(Patient.password),  # exclude password
                defer(Patient.created_by),  # exclude created_by
                defer(Patient.created_at),  # exclude created_at
                defer(Patient.updated_at),  # exclude updated_at
            )
        )

        result = await db.execute(query)
        db_patient_info = result.scalar_one_or_none()

        if not db_patient_info:
            raise ResponseHandler.not_found_error("patient information no found.")

        # restructure the result for general users (e.g, replace ids w base64 strings)
        patient_info_data = profile_data(db_patient_info)

        # convert the data into json and set the data into redis caching
        patient_info_json = json.dumps(jsonable_encoder(patient_info_data))
        redis.set(redis_key, patient_info_json, 3600)

        return patient_info_data

    # handle updating patient information /patient
    @staticmethod
    async def change_patient_information(
        updated_data: UserUpdate, session_user: Patient, db: AsyncSession, redis: Redis
    ):
        result_user = await db.execute(select(User).where(User.id == session_user.id))
        db_user_info = result_user.scalar_one()

        result_patient = await db.execute(
            select(Patient)
            .where(Patient.id == session_user.id)
            .options(
                defer(Patient.password),  # exclude password
                defer(Patient.created_by),  # exclude created_by
                defer(Patient.created_at),  # exclude created_at
                defer(Patient.updated_at),  # exclude updated_at
            )
        )
        db_patient_info = result_patient.scalar_one()

        payload = {"updated_at": func.now(), **updated_data.none_excluded()}

        for key, value in payload.items():
            if key in User.__table__.columns:
                setattr(db_user_info, key, value)
            if key in Patient.__table__.columns:
                setattr(db_patient_info, key, value)

        await db.commit()
        await db.refresh(db_patient_info)

        # restructure the result for general users (e.g, replace ids w base64 strings)
        appointment_info_data = profile_data(db_patient_info)

        # convert the data into json and set the data into redis caching
        redis_key = f"patients:info:{uuid_to_base64(session_user.id)}"
        patient_info_json = json.dumps(jsonable_encoder(appointment_info_data))
        redis.set(redis_key, patient_info_json, 3600)

        return appointment_info_data

    # handle updating account password /default
    @staticmethod
    async def change_user_password(
        updated_data: UserPasswordChange, session_user: Patient, db: AsyncSession
    ):
        # decrypt the passwords from the client
        decrypted_old_pass = await decrypt(updated_data.old_password)
        decrypted_new_pass = await decrypt(updated_data.new_password)

        # verify user old password
        if not verify_password(decrypted_old_pass, session_user.password):
            raise HTTPException(
                status_code=400, detail=f"old password is incorrect - {session_user.id}"
            )

        # generate the new hashed password
        new_hashed_pass = generate_hash(decrypted_new_pass)

        # update the password
        updated_payload = {"password": new_hashed_pass, "updated_at": func.now()}

        result_user = await db.execute(select(User).where(User.id == session_user.id))
        db_patient = result_user.scalar_one()

        for key, value in updated_payload.items():
            setattr(db_patient, key, value)

        await db.commit()
        await db.refresh(db_patient)

        return ResponseHandler.fetch_successful(f"successfully changed user password.")


# refactor user information
def profile_data(data):
    return {
        "id": uuid_to_base64(data.id),
        **{
            key: val
            for key, val in data.__dict__.items()
            if key != "id"  # exclude 'id'
        },
    }
