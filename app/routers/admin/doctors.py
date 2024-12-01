from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends

from app.db import get_db as db 
from app.schemas.doctor import DoctorCreateAdmin, DoctorUpdateAdmin
from app.services.doctor import DoctorService


router = APIRouter()


# get all the doctors 
@router.get('/all')
async def get_all_doctors(
  offset: int = None, 
  limit: int = None, 
  db: Session = Depends(db)
):
  return await DoctorService.retrieve_all_doctors_admin(db, offset, limit)



# create a new doctor account /admin 
@router.post('/{hospital_id}/new', status_code=201)
async def create_new_doctor(details: DoctorCreateAdmin, hospital_id: str, db: Session = Depends(db)):
  return await DoctorService.new_doctor_account_admin(details, hospital_id, db)


# retrive the doctor account informations /admin 
@router.get('/profile')
async def get_doctor_informations(id: str, db: Session = Depends(db)
):
  return await DoctorService.get_doctor_information_admin(id, db)



# update the doctor account informations /admin 
@router.put('/profile')
async def update_doctor_informations(id: str, details: DoctorUpdateAdmin, db: Session = Depends(db)):
  return await DoctorService.update_doctor_information_admin(id, details, db)



# retrive all doctors informations of a specific hospital
@router.get('/{hospital_id}/all')
async def get_all_doctor_of_hospital(
  hospital_id: str,
  offset: int = None, 
  limit: int = None, 
  db: Session = Depends(db)
):
  return await DoctorService.retrieve_doctors_by_hospital_admin(hospital_id, db, offset, limit)
