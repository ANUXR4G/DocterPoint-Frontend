from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, Query
from app.core.dependecies import cache
from redis import Redis

from app.db import get_db as db
from app.services.doctor import DoctorService


router = APIRouter()


# retrieve all the doctor accounts for general users
@router.get("/info/all")
async def retrieve_all_doctor_informations(
    page: int = 1,
    limit: int = Query(default=10, le=100),
    hospitals: list[str] = Query(None),
    locations: list[str] = Query(None),
    experience: int | None = None,
    db: Session = Depends(db),
    redis: Redis = Depends(cache),
):
    return await DoctorService.retrieve_all_doctors_general(
        db, redis, page, limit, hospitals, locations, experience
    )


# retrieve doctor account information using doctor id for general users
@router.get("/profile")
async def get_doctor_information(
    id: str, db: Session = Depends(db), redis: Redis = Depends(cache)
):
    return await DoctorService.get_doctor_information(id, db, redis)


# retrive all doctors informations of a specific hospital for general users
@router.get("/{id}/all")  # /{hospitalId}/all
async def retrieve_all_doctor_from_hospital(
    id: str,
    page: int = 1,
    limit: int = Query(default=10, le=100),
    db: Session = Depends(db),
    redis: Redis = Depends(cache),
):
    return await DoctorService.retrieve_doctors_by_hospital_general(
        id,
        page,
        limit,
        db,
        redis,
    )
