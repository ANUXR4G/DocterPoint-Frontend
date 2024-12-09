import json
from typing import List
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException, Query
from redis import Redis


from app.core.utils import ResponseHandler
from app.models import Patient, HealthRecord
from app.core.security import base64_to_uuid, uuid_to_base64
from app.schemas.health import (
    HealthRecordUpdate,
    HealthRecordResponse,
    BloodGlucose,
    BloodPressure,
    HealthRecordUpdateAdmin,
)
from app.core.socket import socket_manager


class HealthMonitorings:
    # get health record of patient by id
    @staticmethod
    async def get_health_record_details(
        patient_id: str, session_user: Patient, db: Session, redis: Redis
    ):
        user_id = base64_to_uuid(patient_id)  # get the original uuid

        # check if requested user matches w session user
        if user_id != session_user.id:
            raise ResponseHandler.no_permission(
                f"user does not have permission - {user_id}"
            )

        # retrieve and return if there is cached data
        if cached_health_record := redis.get(f"patient_{user_id}_health_record"):
            result = json.loads(cached_health_record)

            return ResponseHandler.fetch_successful(
                f"successfully retrieved patient #{user_id} health record from cached",
                result,
            )

        # get the health record details
        health_record = (
            db.query(HealthRecord).where(HealthRecord.patient_id == user_id).first()
        )

        # check if the health record exists
        if not health_record:
            redis.set(f"patient_{user_id}_health_record", json.dumps([]))
            return ResponseHandler.fetch_successful(
                f"patient #{user_id} does not have any health records!", []
            )

        # if the requested account id doesn't matches w session user id
        if health_record.patient_id != session_user.id:
            raise ResponseHandler.no_permission(
                f"user does not have permission - {user_id}"
            )

        # generated short id using health record id
        id = uuid_to_base64(health_record.id)

        health_record_data = {
            "id": id,
            "weight": health_record.weight,
            "height": health_record.height,
            "blood_group": health_record.blood_group,
            "smoking_status": health_record.smoking_status,
            "physical_activity": health_record.physical_activity,
            "previous_diabetes_records": health_record.previous_diabetes_records,
            "blood_pressure_records": health_record.blood_pressure_records,
            "blood_glucose_records": health_record.blood_glucose_records,
            "body_temperature": health_record.body_temperature,
            "blood_oxygen": health_record.blood_oxygen,
            "bmi": health_record.bmi,
        }

        # set the patient health record information into redis caching
        health_record_json = json.dumps(health_record_data)
        redis.set(f"patient_{user_id}_health_record", health_record_json)

        return ResponseHandler.fetch_successful(
            f"successfully retrieved patient #{user_id} health record - {health_record.id}",
            health_record_data,
        )

    # create health record for patient
    @staticmethod
    async def create_health_record_details(
        health_records: HealthRecordUpdate,
        patient_id: str,
        session_user: Patient,
        db: Session,
        redis: Redis,
    ):
        user_id = base64_to_uuid(patient_id)  # get the original uuid

        # check if requested user matches w session user
        if user_id != session_user.id:
            raise ResponseHandler.no_permission(
                f"user does not have permission - {patient_id}"
            )

        # custom error for empty body
        if health_records.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"creating health record failed, no field was provided - {user_id}",
            )

        payload = {"patient_id": session_user.id, **health_records.none_excluded()}

        # calculate the bmi from with the weight n height
        if health_records.height and health_records.weight:
            height_meters = health_records.height * 0.3048
            payload["bmi"] = round(health_records.weight / (height_meters**2), 2)

        db_health_records = HealthRecord(**payload)
        db.add(db_health_records)
        db.commit()
        db.refresh(db_health_records)

        # generated short id using health record id
        id = uuid_to_base64(db_health_records.id)

        health_record_data = {
            "id": id,
            "weight": db_health_records.weight,
            "height": db_health_records.height,
            "blood_group": db_health_records.blood_group,
            "smoking_status": db_health_records.smoking_status,
            "physical_activity": db_health_records.physical_activity,
            "previous_diabetes_records": db_health_records.previous_diabetes_records,
            "body_temperature": db_health_records.body_temperature,
            "blood_oxygen": db_health_records.blood_oxygen,
            "bmi": db_health_records.bmi,
            "blood_pressure_records": db_health_records.blood_pressure_records,
            "blood_glucose_records": db_health_records.blood_glucose_records,
        }

        health_record_json = json.dumps(health_record_data)
        # sync the health record data in real-time through web socket
        await socket_manager.broadcast_to_room(patient_id, health_record_json)
        # cache created data to redis
        redis.set(f"patient_{user_id}_health_record", health_record_json)

        return ResponseHandler.create_successful(
            f"successfully created patient #{user_id} health record - {db_health_records.id}",
            health_record_data,
        )

    # update health record infromations using health record id
    @staticmethod
    async def update_health_record_by_id(
        updated_data: HealthRecordUpdate,
        record_id: str,
        session_user: Patient,
        db: Session,
        redis: Redis,
    ):
        health_record_id = base64_to_uuid(record_id)  # get the original uuid

        # get the health record details
        health_record = (
            db.query(HealthRecord).where(HealthRecord.id == health_record_id).first()
        )

        if not health_record:
            raise ResponseHandler.not_found_error(
                f"health record not found - {record_id}"
            )

        # # if the requested account id doesn't matches w session user id
        if health_record.patient_id != session_user.id:
            raise ResponseHandler.no_permission(
                f"user does not have permission - {session_user.id}"
            )

        # raise custom error if no field was provided
        if updated_data.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"updating health record failed, no field was provided - {record_id}",
            )

        # update the health record details
        updated_payload = {"updated_at": func.now(), **updated_data.none_excluded()}

        # calculate the bmi from with the weight n height
        if updated_data.height and updated_data.weight:
            height_meters = updated_data.height * 0.3048
            updated_payload["bmi"] = round(updated_data.weight / (height_meters**2), 2)

        db.query(HealthRecord).where(HealthRecord.id == health_record_id).update(
            updated_payload
        )
        db.commit()
        db.refresh(health_record)

        health_record_data = {
            "id": record_id,
            "weight": health_record.weight,
            "height": health_record.height,
            "blood_group": health_record.blood_group,
            "smoking_status": health_record.smoking_status,
            "physical_activity": health_record.physical_activity,
            "previous_diabetes_records": health_record.previous_diabetes_records,
            "body_temperature": health_record.body_temperature,
            "blood_oxygen": health_record.blood_oxygen,
            "bmi": health_record.bmi,
            "blood_pressure_records": health_record.blood_pressure_records,
            "blood_glucose_records": health_record.blood_glucose_records,
        }

        room_id = uuid_to_base64(health_record.patient_id)
        health_record_json = json.dumps(health_record_data)

        # sync the health record data in real-time through web socket
        await socket_manager.broadcast_to_room(room_id, health_record_json)
        # cache updated data to redis
        redis.set(
            f"patient_{health_record.patient_id}_health_record", health_record_json
        )

        return ResponseHandler.fetch_successful(
            f"successfully updated patient #{health_record.patient_id} health record - {health_record_id}",
            health_record_data,
        )

    @staticmethod
    async def update_blood_pressure_by_id(
        updated_data: BloodPressure, record_id: str, session_user: Patient, db: Session
    ):
        health_record_id = base64_to_uuid(
            record_id
        )  # get the original uuid from the url

        # get the health record details
        health_record = (
            db.query(HealthRecord).where(HealthRecord.id == health_record_id).first()
        )

        if not health_record:
            raise ResponseHandler.not_found_error(
                f"health record not found - {record_id}"
            )

        # # if the requested account id doesn't matches w session user id
        if health_record.patient_id != session_user.id:
            raise ResponseHandler.no_permission(
                f"user does not have permission - {session_user.id}"
            )

        # raise custom error if no field was provided
        if updated_data.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"updating health record failed, no field was provided - {record_id}",
            )

        # update the blood pressure records
        updated_payload = {"updated_at": func.now(), **updated_data.model_dump()}

        db.query(HealthRecord).where(HealthRecord.id == health_record_id).update(
            updated_payload
        )
        db.commit()
        db.refresh(health_record)

        return {
            "status": "successful",
            "message": f"successfully updated blood pressure record - {health_record.id}!",
            "data": BloodPressure(
                blood_pressure_records=health_record.blood_pressure_records
            ),
        }

    @staticmethod
    async def update_blood_glucose_by_id(
        updated_data: BloodGlucose, record_id: str, session_user: Patient, db: Session
    ):
        health_record_id = base64_to_uuid(
            record_id
        )  # get the original uuid from the url

        # get the health record details
        health_record = (
            db.query(HealthRecord).where(HealthRecord.id == health_record_id).first()
        )

        if not health_record:
            raise ResponseHandler.not_found_error(
                f"health record not found - {record_id}"
            )

        # # if the requested account id doesn't matches w session user id
        if health_record.patient_id != session_user.id:
            raise ResponseHandler.no_permission(
                f"user does not have permission - {session_user.id}"
            )

        # raise custom error if no field was provided
        if updated_data.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"updating health record failed, no field was provided - {record_id}",
            )

        # update the blood glucose records
        updated_payload = {"updated_at": func.now(), **updated_data.model_dump()}

        db.query(HealthRecord).where(HealthRecord.id == health_record_id).update(
            updated_payload
        )
        db.commit()
        db.refresh(health_record)

        return {
            "status": "successful",
            "message": f"successfully updated blood glucose record - {health_record.id}!",
            "data": BloodGlucose(
                blood_glucose_records=health_record.blood_glucose_records
            ),
        }

    # retrive all the patient health records /admin
    @staticmethod
    async def retrieve_all_health_records_admin(
        db: Session,
        offset: int = 0,
        # this way it adds a layer of constraint, asking the parameter either be 100 or less than 100
        limit: int = Query(default=25, le=100),
    ):
        health_records = db.query(HealthRecord).offset(offset).limit(limit).all()

        return {
            "status": "successful",
            "message": "successfully fetched all health records!",
            "data": health_records,
        }

    # retrive patient health record using patient id /admin
    @staticmethod
    async def get_patient_health_record_admin(patient_id: str, db: Session):
        patient = db.query(Patient).where(Patient.id == patient_id).first()

        # check if the patient exists
        if not patient:
            raise ResponseHandler.not_found_error(
                f"patient does not exists - {patient_id}"
            )

        health_records = (
            db.query(HealthRecord).where(HealthRecord.patient_id == patient_id).all()
        )

        return {
            "status": "successful",
            "message": f"successfully fetched patient health record - {patient_id}",
            "data": health_records,
        }

    # create patient health record using patient id /admin
    @staticmethod
    async def create_patient_health_record_admin(
        patient_id: str, details: HealthRecordUpdateAdmin, db: Session
    ):
        patient = db.query(Patient).where(Patient.id == patient_id).first()

        # check if the patient exists
        if not patient:
            raise ResponseHandler.not_found_error(
                f"patient does not exists - {patient_id}"
            )

        # custom error for empty body
        if details.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"creating health record failed, no field was provided - {patient_id}",
            )

        payload = {"patient_id": patient.id, **details.none_excluded()}

        # calculate the bmi from with the weight n height
        if details.height and details.weight:
            height_meters = details.height * 0.3048
            payload["bmi"] = round(details.weight / (height_meters**2), 2)

        db_health_record = HealthRecord(**payload)

        db.add(db_health_record)
        db.commit()
        db.refresh(db_health_record)

        return {
            "status": "successful",
            "message": f"successfully created health record - {db_health_record.id}",
            "data": db_health_record,
        }

    # update patient health record using record id /admin
    @staticmethod
    async def update_patient_health_record_admin(
        record_id: str, details: HealthRecordUpdateAdmin, db: Session
    ):
        health_record = (
            db.query(HealthRecord).where(HealthRecord.id == record_id).first()
        )

        # check if health record exists
        if not health_record:
            raise ResponseHandler.not_found_error(
                f"health record does not exists - {record_id}"
            )

        # raise custom error if no field was provided
        if details.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"updating health record failed, no field was provided - {record_id}",
            )

        # update the health record details
        updated_payload = {"updated_at": func.now(), **details.none_excluded()}

        # calculate the bmi from with the weight n height
        if details.height and details.weight:
            height_meters = details.height * 0.3048
            updated_payload["bmi"] = round(details.weight / (height_meters**2), 2)

        db.query(HealthRecord).where(HealthRecord.id == health_record.id).update(
            updated_payload
        )
        db.commit()
        db.refresh(health_record)

        return {
            "status": "successful",
            "message": f"successfully updated health record - {health_record.id}!",
            "data": health_record,
        }

    # delete patient health record using record id /admin
    async def delete_patient_health_record_admin(record_id: str, db: Session):
        targeted_health_record = (
            db.query(HealthRecord).where(HealthRecord.id == record_id).first()
        )

        if not targeted_health_record:
            raise ResponseHandler.not_found_error(f"user-{id} not found!")

        db.delete(targeted_health_record)
        db.commit()

        return {
            "status": "successful",
            "message": f"successfully deleted patient health record - {record_id}",
        }

    # delete a batch of user accounts /admin
    @staticmethod
    async def delete_patient_health_record_batch_admin(ids: List[str], db: Session):
        # get the target health records
        targeted_health_records = (
            db.query(HealthRecord).filter(HealthRecord.id.in_(ids)).all()
        )

        # get the missing ids if there is any
        existing_ids = [str(user.id) for user in targeted_health_records]
        missing_ids = list(set(ids) - set(existing_ids))
        missing_message = None

        # if targeted health record not found
        if len(existing_ids) == 0:
            raise ResponseHandler.not_found_error(
                "health record " + ", ".join(missing_ids) + " has not been found!"
            )

        # delete the targeted health records
        db.query(HealthRecord).filter(HealthRecord.id.in_(ids)).delete(
            synchronize_session=False
        )
        db.commit()

        # custom message when some of the ids are missing
        if len(missing_ids) > 0:
            missing_message = "health record " + ", ".join(missing_ids) + " not found!"

        # message w custom message if there is any
        custom_message = (
            "health record "
            + ", ".join(existing_ids)
            + " has been deleted successfully"
            + (" and " + missing_message if missing_message else "!")
        )

        return {"status": "successful", "message": custom_message}
