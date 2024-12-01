from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends

from app.db import get_db as db
from app.services.hospital import HospitalService


router = APIRouter()


# retrieve all the hospital details 
@router.get('/all')
async def get_all_hospitals(
  offset: int = None, 
  limit: int = None, 
  db: Session = Depends(db)
):
  return await HospitalService.retrieve_all_hospitals(db, offset, limit)


# retrieve hospital details using hospital id 
@router.get('/profile')
async def get_hospital_information(id: str, db: Session = Depends(db)):
  return await HospitalService.get_hospital_information(id, db)