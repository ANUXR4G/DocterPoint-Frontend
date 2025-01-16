from fastapi import HTTPException, Query
from typing import List

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import Patient, HealthRecord
from app.core.utils import ResponseHandler
from app.schemas.health import (
    HealthRecordUpdateAdmin,
)


class HealthMonitoringsAdmin:
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
