from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends
from redis import Redis

from app.db import get_db as db
from app.models import Hospital
from app.core.utils import ResponseHandler
from app.services.hospital import HospitalService
from app.core.dependecies import cache


router = APIRouter()


# retrieve all the hospital details
@router.get("/all")
async def get_all_hospitals(
    offset: int = None, limit: int = None, db: Session = Depends(db)
):
    return await HospitalService.retrieve_all_hospitals(db, offset, limit)


@router.get("/tags/names")
async def get_all_names(
    db: Session = Depends(db),
    redis: Redis = Depends(cache),
):
    return await HospitalService.retrieve_all_names(db, redis)


@router.get("/tags/cities")
async def get_all_locations(db: Session = Depends(db), redis: Redis = Depends(cache)):
    return await HospitalService.retrieve_all_locations(db, redis)


# retrieve hospital details using hospital id
@router.get("/profile")
async def get_hospital_information(id: str, db: Session = Depends(db)):
    return await HospitalService.get_hospital_information(id, db)
