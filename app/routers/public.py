from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, Query
from app.core.dependecies import cache
from redis import Redis

from app.db import get_async_db as db
from app.services.public import DoctorService, HospitalService


router1 = APIRouter()
router2 = APIRouter()


@router1.get("/info")
async def retrieve_all_doctors(
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
    q: str | None = None,
    page: int = 1,
    limit: int = Query(default=10, le=100),
    hospitals: list[str] = Query(None),
    locations: list[str] = Query(None),
    experience: int = Query(None),
):
    """
    Retrieve a list of doctors with optional filters.
    -------------------------------------------------

    Parameters:
    -----------
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.
    - q (Optional[str]): The search query to filter doctors by name or other criteria (case-insensitive) | default=None
    - page (int): The page number for pagination | default=1
    - limit (int): The maximum number of doctors to retrieve per page. Must be less than or equal to 100 | default=10
    - hospitals (list[str]): A list of hospital names to filter doctors by their associated hospitals | default=None
    - locations (list[str]): A list of location names to filter doctors by their working locations | default=None
    - experience (int): The minimum number of years of experience to filter doctors | default=None

    Returns:
    --------
    - total: The total number of retrieved data.
    - patients: A list containing containing the retrieved doctors information.

    """

    return await DoctorService.get_all_doctors(
        db, redis, q, page, limit, hospitals, locations, experience
    )


@router1.get("/{id}/info")
async def retrieve_doctor_information(
    id: str, db: AsyncSession = Depends(db), redis: Redis = Depends(cache)
):
    """
    Retrieve a specific doctor information using doctor id.
    --------------------------------------------------------

    Parameters:
    -----------
    - id (str): The ID of the doctor whose information is to be retrieved.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - The information of the specified doctor retrieved from the database.
    """

    return await DoctorService.get_doctor_by_id(id, db, redis)


@router1.get("/hospital")
async def retrieve_all_doctor_from_hospital(
    id: str,
    page: int = 1,
    limit: int = Query(default=10, le=100),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve all doctor informations of a specific hospital using hospital id.
    -------------------------------------------------------------------------

    Parameters:
    -----------
    - id (str): The ID of the hospital whose doctors' information is to be retrieved.
    - page (int): The page number for pagination | default=1
    - limit (int): The maximum number of doctors to retrieve per page. Must be less than or equal to 100 | default=10
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - total: The total number of retrieved data.
    - doctors: A list containing the retrieved doctor information.

    """

    return await DoctorService.get_doctors_by_hospital_id(
        id,
        db,
        redis,
        page,
        limit,
    )


@router2.get("/tags/names")
async def retrieve_all_names(
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve a list containing all the hospital names.
    --------------------------------------------------

    Parameters:
    -----------
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - A list containing all the hospital names.

    """

    return await HospitalService.get_all_names(db, redis)


@router2.get("/tags/cities")
async def retrieve_all_locations(
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve a list containing all the hospital locations.
    -------------------------------------------------------

    Parameters:
    -----------
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - hospital_locations: A list containing all the hospital locations.

    """

    return await HospitalService.get_all_locations(db, redis)


@router2.get("/info")
async def retrieve_all_hospitals(
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
    q: str | None = None,
    page: int = 1,
    limit: int = Query(default=10, le=100),
    locations: list[str] = Query(None),
):
    """
    Retrieve a list of hospitals based on various optional search criteria.
    -----------------------------------------------------------------------

    Parameters:
    -----------
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.
    - q (Optional[str]): The search query to filter hospitals by name or other criteria (case-insensitive) | default=None
    - page (int): The page number for pagination | default=1
    - limit (int): The maximum number of hospitals to retrieve per page. Must be less than or equal to 100 | default=10
    - locations (list[str]): A list of location names to filter hospitals by their locations | default=None

    Returns:
    --------
    - total: The total number of retrieved data.
    - hospitals: A list containing the retrieved hospital information.

    """

    return await HospitalService.get_all_hospitals(db, redis, q, page, limit, locations)


@router2.get("/{id}/info")
async def retrieve_hospital_information(
    id: str, db: AsyncSession = Depends(db), redis: Redis = Depends(cache)
):
    """
    Retrieve specific hospital information using hospital id.
    ----------------------------------------------------------

    Parameters:
    -----------
    - id (str): The ID of the hospital whose information is to be retrieved.
    - db (AsyncSession): The database session for executing SQL queries asynchronously.
    - redis (Redis): The Redis instance for caching purposes.

    Returns:
    --------
    - The information of the specified hospital retrieved from the database.

    """

    return await HospitalService.get_hospital_by_id(id, db, redis)
