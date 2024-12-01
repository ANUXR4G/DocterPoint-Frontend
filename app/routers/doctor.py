from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends

from app.db import get_db as db
from app.services.doctor import DoctorService


router = APIRouter()


# retrieve all the doctor accounts for general users 
@router.get('/all')
async def retrieve_all_doctor_informations(
  offset: int = None, 
  limit: int = None, 
  db: Session = Depends(db)
):
  return await DoctorService.retrieve_all_doctors_general(db, offset, limit)



# retrieve doctor account information using doctor id for general users 
@router.get('/profile')
async def get_doctor_information(id: str, db: Session = Depends(db)):
  return await DoctorService.get_doctor_information(id, db)


# retrive all doctors informations of a specific hospital for general users
@router.get('/{hospital_id}/all')
async def get_all_doctor_of_hospital(
  hospital_id: str,
  offset: int = None, 
  limit: int = None, 
  db: Session = Depends(db)
):
  return await DoctorService.retrieve_doctors_by_hospital_general(hospital_id, db, offset, limit)
