from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, Query
from redis import Redis

from app.db import get_db as db
from app.models import Hospital
from app.core.utils import ResponseHandler
from app.services.hospital import HospitalService
from app.core.dependecies import cache


router = APIRouter()


# retrieve all the hopital names
@router.get("/tags/names")
async def get_all_names(
    db: Session = Depends(db),
    redis: Redis = Depends(cache),
):
    return await HospitalService.retrieve_all_names(db, redis)


# retrieve all the hopital locations
@router.get("/tags/cities")
async def get_all_locations(db: Session = Depends(db), redis: Redis = Depends(cache)):
    return await HospitalService.retrieve_all_locations(db, redis)


# retrieve all the hospital details
@router.get("/info/all")
async def get_all_hospitals(
    page: int = 1,
    limit: int = Query(default=10, le=100),
    locations: list[str] = Query(None),
    db: Session = Depends(db),
    redis: Redis = Depends(cache),
):
    return await HospitalService.retrieve_all_hospitals(
        db, redis, page, limit, locations
    )


# retrieve hospital details using hospital id
@router.get("/info")
async def get_hospital_information(
    id: str, db: Session = Depends(db), redis: Redis = Depends(cache)
):
    return await HospitalService.retrieve_hospital_information(id, db, redis)
