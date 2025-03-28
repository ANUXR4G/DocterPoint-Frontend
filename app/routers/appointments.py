from redis import Redis

from fastapi import APIRouter, Depends, Security, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_async_db as db
from app.models import Patient, Doctor
from app.core.dependecies import include_auth, cache
from app.services.appointment import AppointmentService
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate


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
    Retrieve a list of appointments for the currently authenticated patient.
    ------------------------------------------------------------------------

    Parameters:
    -----------
    - q (str | None): The search query to filter appointments by description or other details | default=None.
    - page (int): The page number for pagination | default=1.
    - limit (int): The maximum number of appointments to retrieve per page | default=10, with a maximum of 100.
    - session_user (Patient): The currently autheticated patient user with the required security scopes.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - A list containing the appointment information for the specified patient.

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
    Create a new appointment for the currently authenticated patient.
    -----------------------------------------------------------------

    Parameters:
    -----------
    - appointment (AppointmentCreate): The details of the appointment to be created.
    - session_user (Patient): The currently authenticated patient user with the required security scopes.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - The details of the newly created appointment.

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
    Retrieve detailed information for a specific appointment for the currently authenticated patient.
    ------------------------------------------------------------------------------------------------

    Parameters:
    -----------
    - id (str): The ID of the appointment to be retrieved.
    - session_user (Patient): The currently authenticated patient user with the required security scopes.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - The detailed information of the specified appointment.

    """

    return await AppointmentService.get_appointment_by_id(id, session_user, db, redis)


# update a specific appointment details
@router.put("/{id}/info")
async def update_patient_appointment_info(
    id: str,
    payload: AppointmentUpdate,
    _: Patient | Doctor = Security(
        include_auth,
        scopes=["appointment:update"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Update the information of a specific appointment for the currently authenticated patient.
    -----------------------------------------------------------------------------------------

    Parameters:
    -----------
    - id (str): The ID of the appointment to be updated.
    - payload : The details of the appointment to be updated.
    - _ (Patient): The currently authenticated patient user with the required security scopes.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - The updated information of the specified appointment.

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
    Retrieve a list of upcoming appointments for the currently authenticated patient.
    --------------------------------------------------------------------------------

    Parameters:
    -----------
    - session_user (Patient): The currently authenticated patient user with the required security scopes.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - A list containing the upcoming appointment information for the specified patient.

    """

    return await AppointmentService.get_upcoming_appointments(session_user, db, redis)
