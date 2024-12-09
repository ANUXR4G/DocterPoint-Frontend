from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, Security
from redis import Redis


from app.models import Patient
from app.db import get_db as db
from app.core.dependecies import include_auth, cache
from app.services.health import (
    HealthMonitorings,
    HealthRecordUpdate,
    BloodPressure,
    BloodGlucose,
)


router = APIRouter()


# get health record using patient id
@router.get("/records")
async def get_patient_health_records(
    id: str,
    session_user: Patient = Security(
        include_auth,
        scopes=["health:read", "health:write", "health:update", "health:delete"],
    ),
    db: Session = Depends(db),
    redis: Redis = Depends(cache),
):
    return await HealthMonitorings.get_health_record_details(
        id, session_user, db, redis
    )


# create health record using patient id
@router.post("/records", status_code=201)
async def create_patient_health_records(
    health_records: HealthRecordUpdate,
    id: str,
    session_user: Patient = Depends(include_auth),
    db: Session = Depends(db),
    redis: Redis = Depends(cache),
):
    return await HealthMonitorings.create_health_record_details(
        health_records, id, session_user, db, redis
    )


# update health record using record id
@router.put("/records")
async def update_patient_health_records(
    updated_data: HealthRecordUpdate,
    id: str,
    session_user: Patient = Depends(include_auth),
    db: Session = Depends(db),
    redis: Redis = Depends(cache),
):
    return await HealthMonitorings.update_health_record_by_id(
        updated_data, id, session_user, db, redis
    )


# update patient blood pressure records
@router.put("/records/pressure")
async def update_patient_blood_pressure_records(
    updated_data: BloodPressure,
    id: str,
    session_user: Patient = Depends(include_auth),
    db: Session = Depends(db),
):
    return await HealthMonitorings.update_blood_pressure_by_id(
        updated_data, id, session_user, db
    )


# update patient blood glucose records
@router.put("/records/glucose")
async def update_patient_blood_glucose_records(
    updated_data: BloodGlucose,
    id: str,
    session_user: Patient = Depends(include_auth),
    db: Session = Depends(db),
):
    return await HealthMonitorings.update_blood_glucose_by_id(
        updated_data, id, session_user, db
    )
