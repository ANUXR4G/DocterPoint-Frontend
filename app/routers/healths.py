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
    Retrieve the health record of the logged-in patient.
    ----------------------------------------------------

    Parameters:
    -----------
    - session_user (Patient): The authenticated patient making the request, authorized with the required security scopes ["patient:read", "monitoring:read"].
    - db (AsyncSession): The asynchronous database session used for querying health record data.
    - redis (Redis): The Redis instance used for caching to enhance performance and reduce database load.

    Returns:
    --------
    - The health record of the patient, retrieved and processed using the appropriate services.

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
    Create a new health record for the logged-in patient.
    -----------------------------------------------------

    Parameters:
    -----------
    - health_records (HealthRecordUpdate): The input payload containing the details of the health record to be created.
    - session_user (Patient): The authenticated patient making the request, authorized with the required security scopes ["patient:read", "monitoring:write"].
    - db (AsyncSession): The asynchronous database session used for inserting the health record into the database.
    - redis (Redis): The Redis instance used for caching to enhance performance and synchronize data.

    Returns:
    --------
    - Newly created patient's health record.

    """

    return await HealthMonitorings.new_health_record(
        health_records, session_user, db, redis
    )


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
    """
    Update an existing health record for the logged-in patient.
    -----------------------------------------------------------

    Parameters:
    -----------
    - updated_data (HealthRecordUpdate): The input payload containing the updated health record details.
    - id (str): The unique identifier of the health record to be updated.
    - session_user (Patient): The authenticated patient making the request, authorized with the required security scopes ["patient:read", "monitoring:read", "monitoring:update"].
    - db (AsyncSession): The asynchronous database session used for updating the health record in the database.
    - redis (Redis): The Redis instance used for caching to enhance performance and synchronize data.

    Returns:
    --------
    - Confirmation of the successful update of the patient's health record.

    """

    return await HealthMonitorings.update_health_record_by_id(
        updated_data, id, session_user, db, redis
    )
