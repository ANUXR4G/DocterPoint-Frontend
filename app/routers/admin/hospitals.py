from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db as db 
from app.core.utils import ResponseHandler
from app.services.hospital import HospitalService
from app.schemas.hospital import HospitalCreateAdmin, HospitalUpdateAdmin


router = APIRouter()


# get all the hospital informations 
@router.get('/all')
async def get_all_hospitals(
  offset: int = None, 
  limit: int = None, 
  db: Session = Depends(db)
):
  return await HospitalService.retrieve_all_hospitals_admin(db, offset, limit)



# create a new hospital account /admin 
@router.post('/new', status_code=201)
async def create_new_hospital(details: HospitalCreateAdmin, db: Session = Depends(db)):
  return await HospitalService.create_hospital_account_admin(details, db)


# retrive a hospital information /admin 
@router.get('/profile')
async def get_hospital_informations(id: str, db: Session = Depends(db)
):
  return await HospitalService.get_hospital_information_admin(id, db)


# update a hospital information /admin 
@router.put('/profile')
async def update_hospital_informations(id: str, details: HospitalUpdateAdmin, db: Session = Depends(db)):
  return await HospitalService.update_hospital_information_admin(id, details, db)



# delete hopitals using a single record id or multiple record ids  
@router.delete('/profile')
async def delete_hospital(id: str | None = None, ids: List[str] | None = None, db: Session = Depends(db)):
  if id and ids:
    raise ResponseHandler.no_permission('choose either single or batch delete option!')

  # delete a single health record using record id  
  if id:
    return await HospitalService.delete_hospital_admin(id, db)

  # delete a batch of health records using multiple ids 
  if ids:
    return await HospitalService.delete_hospital_batch_admin(ids, db)


