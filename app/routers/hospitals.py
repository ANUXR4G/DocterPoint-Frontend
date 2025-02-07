from fastapi import APIRouter, Depends, Query
from redis import Redis

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_async_db as db
from app.services.public import HospitalService
from app.core.dependecies import cache


router = APIRouter()


# retrieve all the hopital names
@router.get("/tags/names")
async def retrieve_all_names(
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve a list which contains all the hospital names.
    """

    return await HospitalService.get_all_names(db, redis)


# retrieve all the hopital locations
@router.get("/tags/cities")
async def retrieve_all_locations(
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve a list which contains all the hospital locations.
    """

    return await HospitalService.get_all_locations(db, redis)


# retrieve all the hospital details
@router.get("/info")
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
    """

    return await HospitalService.get_all_hospitals(db, redis, q, page, limit, locations)


# retrieve hospital details using hospital id
@router.get("/{id}/info")
async def retrieve_hospital_information(
    id: str, db: AsyncSession = Depends(db), redis: Redis = Depends(cache)
):
    """
    Retrieve a specific hospital information using hospital id.
    """
    return await HospitalService.get_hospital_by_id(id, db, redis)
