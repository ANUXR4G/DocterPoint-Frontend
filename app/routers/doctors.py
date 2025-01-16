from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, Query
from app.core.dependecies import cache
from redis import Redis

from app.db import get_async_db as db
from app.services.doctor import DoctorService


router = APIRouter()


@router.get("/info")
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
    Retrieve a list of doctors based on various optional search criteria.
    """

    return await DoctorService.get_all_doctors(
        db, redis, q, page, limit, hospitals, locations, experience
    )


@router.get("/{id}/info")
async def retrieve_doctor_information(
    id: str, db: AsyncSession = Depends(db), redis: Redis = Depends(cache)
):
    """
    Retrieve a specific doctor information using doctor id.
    """

    return await DoctorService.get_doctor_by_id(id, db, redis)


@router.get("/hospital")
async def retrieve_all_doctor_from_hospital(
    id: str,
    page: int = 1,
    limit: int = Query(default=10, le=100),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve all doctor informations of a specific hospital using hospital id.
    """

    return await DoctorService.get_doctors_by_hospital_id(
        id,
        db,
        redis,
        page,
        limit,
    )
