from redis import Redis

from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, Security, Query

from app.services.doctor import DoctorService
from app.core.dependecies import include_auth, cache
from app.db import get_async_db as db
from app.models import Doctor


router = APIRouter()


@router.get("/info")
async def retrieve_profile_information(
    session_user: Doctor = Security(
        include_auth, scopes=["doctor:read", "doctor:update"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve information of a specific doctor based on the current session.

    Parameters:
    -----------
    session_user: The currently logged-in doctor (session user).
    db: The database session for executing SQL queries asynchronously.
    redis: The Redis instance for caching purposes.


    Returns:
    --------
        Information of the specific doctor.
    """

    return await DoctorService.get_info(session_user, db, redis)


@router.get("/{user_id}/patients")
async def retrieve_appointed_patients_information(
    user_id: str,
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
    Retrieve a list of appointed patients to a doctor by doctor_id.

    Parameters:
    -----------
    doctor_id: The ID of the doctor for whom the appointments are to be retrieved.
    session_user: The currently logged-in doctor (session user).
    db: The database session for executing SQL queries asynchronously.
    redis: The Redis instance for caching purposes.
    q: The search query to filter patients by name (case-insensitive).
    age: The age filter to sort patients by age. Values can be "young" or "old".
    gender: The gender filter to sort patients by gender. Values can be "male" or "female".
    page : The page number for pagination.
    limit : The maximum number of patients to retrieve per page.

    Returns:
    --------
        total: The total number of retrieve data based on the requirements.
        patients: A list containing the patient information and appointment details.

    """

    return await DoctorService.get_patients(
        user_id, session_user, db, redis, q, age, gender, page, limit
    )
