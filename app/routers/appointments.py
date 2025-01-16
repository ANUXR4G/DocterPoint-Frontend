from redis import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, Security, Query

from app.models import Patient
from app.db import get_async_db as db
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate
from app.services.appointment import AppointmentService
from app.core.dependecies import include_auth, cache

router = APIRouter()


@router.get("/info")
async def retrieve_patient_appointments(
    q: str | None = None,
    page: int = 1,
    limit: int = Query(default=10, le=100),
    session_user: Patient = Security(
        include_auth,
        scopes=["appointment:read"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve a list of patient appointments based on various optional search criteria.
    """
    return await AppointmentService.get_all_appointments(
        q, page, limit, session_user, db, redis
    )


# create new appointment /patient
@router.post("/new", status_code=201)
async def create_patient_appointment(
    appointment: AppointmentCreate,
    session_user: Patient = Security(
        include_auth,
        scopes=["appointment:write"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Create a new appointment record for patient.
    """
    return await AppointmentService.new_appointment(
        appointment, session_user, db, redis
    )


# retrive appointment details /patient
@router.get("/{id}/info")
async def retrieve_patient_appointment_info(
    id: str,
    session_user: Patient = Security(
        include_auth,
        scopes=["appointment:read"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve a specific patient appointment information using appointment id.
    """
    return await AppointmentService.get_appointment_by_id(id, session_user, db, redis)


# update a specific appointment details
@router.put("/{id}/info")
async def update_patient_appointment_info(
    id: str,
    payload: AppointmentUpdate,
    _: Patient = Security(
        include_auth,
        scopes=["appointment:update"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Update a specific patient appointment information using appointment id.
    """
    return await AppointmentService.update_appointment_by_id(id, payload, db, redis)


# retrieve all the upcoming appointments
@router.get("/upcoming")
async def retrieve_patient_upcoming_appointments(
    session_user: Patient = Security(
        include_auth,
        scopes=["appointment:read"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve a list of patient upcoming appointments.
    """
    return await AppointmentService.get_upcoming_appointments(session_user, db, redis)
