from fastapi import APIRouter, Depends, Security
from redis import Redis
from sqlalchemy.ext.asyncio import AsyncSession


from app.models import Patient
from app.db import get_async_db as db
from app.core.dependecies import include_auth, cache
from app.services.health import (
    HealthMonitorings,
    HealthRecordUpdate,
)


router = APIRouter()


@router.get("/records")
async def retrieve_patient_health_record(
    session_user: Patient = Security(
        include_auth,
        scopes=["patient:read", "monitoring:read"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve patient health record information of the session patient.
    """
    return await HealthMonitorings.get_health_record_info(session_user, db, redis)


@router.post("/records/new", status_code=201)
async def create_patient_health_record(
    health_records: HealthRecordUpdate,
    session_user: Patient = Security(
        include_auth,
        scopes=["patient:read", "monitoring:write"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Create a new health record for patient.
    """
    return await HealthMonitorings.new_health_record(
        health_records, session_user, db, redis
    )


# update health record using record id
@router.put("/records")
async def update_patient_health_records(
    updated_data: HealthRecordUpdate,
    id: str,
    session_user: Patient = Security(
        include_auth,
        scopes=["patient:read", "monitoring:read", "monitoring:update"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    return await HealthMonitorings.update_health_record_by_id(
        updated_data, id, session_user, db, redis
    )
