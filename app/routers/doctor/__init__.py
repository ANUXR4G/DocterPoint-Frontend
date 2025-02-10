from redis import Redis

from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, Security, Query

from app.services.doctor import DoctorService
from app.core.dependecies import include_auth, cache
from app.db import get_async_db as db
from app.models import Doctor


router = APIRouter()


@router.get("/info")
async def retrieve_info(
    session_user: Doctor = Security(
        include_auth, scopes=["doctor:read", "doctor:update"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve information of a specific doctor based on the current session.
    ---------------------------------------------------------------

    Parameters:
    -----------
    - session_user (Doctor): The currently logged-in doctor (session user).
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.


    Returns:
    --------
    - Information of the specific doctor.

    """

    return await DoctorService.get_info(session_user, db, redis)


@router.get("/{doctor_id}/patients")
async def retrieve_patients(
    doctor_id: str,
    session_user: Doctor = Security(
        include_auth, scopes=["doctor:read", "doctor:update", "patient:read"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
    q: str | None = None,
    age: str | None = None,
    gender: str | None = None,
    page: int = 1,
    limit: int = Query(default=10, le=100),
):
    """
    Retrieve a list of patients appiointed to a doctor by doctor_id.
    ---------------------------------------------------------------

    Parameters:
    -----------
    - doctor_id (str): The ID of the doctor for whom the appointments are to be retrieved.
    - session_user (Doctor): The currently logged-in doctor (session user).
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.
    - q (str): The search query to filter patients by name (case-insensitive) | default=None
    - age (str): The age filter to sort patients by age | "young" | "old" | None | default=None
    - gender (str): The gender filter to sort patients by gender | "male" | "female" | None | default=None
    - page (int): The page number for pagination.
    - limit (int): The maximum number of patients to retrieve per page.

    Returns:
    --------
    - total: The total number of retrieved data.
    - patients: A list containing the patient information and appointment details.

    """

    return await DoctorService.get_patients(
        doctor_id, session_user, db, redis, q, age, gender, page, limit
    )


@router.get("/{doctor_id}/appointments")
async def retrieve_appointments(
    doctor_id: str,
    session_user: Doctor = Security(
        include_auth, scopes=["doctor:read", "doctor:update", "patient:read"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
    date: str = "latest",
    status: int = 1,
    q: str | None = None,
    page: int = 1,
    limit: int = Query(default=10, le=100),
):
    """
    Retrieve a list of appointments for a specific doctor.
    ------------------------------------------------------

    Parameters:
    -----------
    - doctor_id (str): The ID of the doctor whose appointments are to be retrieved.
    - session_user (Doctor): The currently logged-in doctor (session user) with the required security scopes.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.
    - date (str): The date filter to sort appointments by date | "latest" | "old" | default="latest"
    - status (int): The status filter to filter appointments by their status | 1 | 2 | 3 | 4 | 5 | default=1
    - q (str): The search query to filter appointments by patient name or other criteria (case-insensitive) | default=None
    - page (int): The page number for pagination | default=1
    - limit (int): The maximum number of appointments to retrieve per page. Must be less than or equal to 100 | default=10

    Returns:
    --------
    - total: The total number of retrieved data.
    - appointments: A list containing the retrieved appointment information.

    """

    return await DoctorService.get_appointments(
        doctor_id, session_user, db, redis, status, date, q, page, limit
    )


@router.get("/{doctor_id}/analytics")
async def retrieve_analytics(
    doctor_id: str,
    session_user: Doctor = Security(
        include_auth,
        scopes=["doctor:read", "doctor:analytics", "doctor:update", "patient:read"],
    ),
    db: AsyncSession = Depends(db),
    type: str = "day",
):
    """
    Retrieve analytics of patients and appointments for a specific doctor.
    ----------------------------------------------------------------------

    Parameters:
    -----------
    - doctor_id (str): The ID of the doctor whose analytics are to be retrieved.
    - session_user (Doctor): The currently logged-in doctor (session user) with the required security scopes.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - type (str): The period type for which to retrieve the analytics ('day', 'week', 'month', 'year') | deafult='day'.

    Returns:
    --------
    - result: Analytics of patients and appointments, categorized by gender.

    """

    return await DoctorService.get_analytics(doctor_id, session_user, db, type)
