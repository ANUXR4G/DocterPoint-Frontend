from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db as db 
from app.core.utils import ResponseHandler
from app.services.patient import PatientService
from app.services.health import HealthMonitorings
from app.schemas.health import HealthRecordUpdateAdmin
from app.schemas.users import PatientCreateAdmin, PatientUpdateAdmin



router = APIRouter()



# get all the patient informations /admin
@router.get('/all')
async def get_all_patients(
  offset: int = None, 
  limit: int = None, 
  db: Session = Depends(db)
):
  return await PatientService.retrieve_all_patients_admin(db, offset, limit)


# create a new patient account /admin 
@router.post('/new', status_code=201)
async def create_new_patient_account(patient_data: PatientCreateAdmin, db: Session = Depends(db)):
  return await PatientService.create_patient_account_admin(patient_data, db)


# retrive a patient information /admin
@router.get('/profile')
async def get_patient_account_informations(id: str, db: Session = Depends(db)
):
  return await PatientService.get_patient_information_admin(id, db) 


# update a patient information /admin
@router.put('/profile')
async def update_patient_account_informations(id: str, details: PatientUpdateAdmin, db: Session = Depends(db)):
  return await PatientService.update_patient_information_admin(id, details, db) 



# get all patient health record details 
@router.get('/health/records/all')
async def get_all_patient_health_record_details(
  offset: int = None, 
  limit: int = None, 
  db: Session = Depends(db)
):
  return await HealthMonitorings.retrieve_all_health_records_admin(db, offset, limit)



# create new health record using patient id 
@router.post('/health/records/new')
async def create_patient_health_records(id: str, details: HealthRecordUpdateAdmin, db: Session = Depends(db)):
  return await HealthMonitorings.create_patient_health_record_admin(id, details, db)



# get patient health record details using patient id 
@router.get('/health/records')
async def get_patient_health_record_details(id: str, db: Session = Depends(db)):
  return await HealthMonitorings.get_patient_health_record_admin(id, db)



# update patient health record details using record id 
@router.put('/health/records')
async def update_patient_health_record_details(id: str, details: HealthRecordUpdateAdmin, db: Session = Depends(db)):
  return await HealthMonitorings.update_patient_health_record_admin(id, details, db)



# delete patient health record using a single record id or multiple record ids  
@router.delete('/health/records')
async def delete_patient_health_record(id: str | None = None, ids: List[str] | None = None, db: Session = Depends(db)):
  if id and ids:
    raise ResponseHandler.no_permission('choose either single or batch delete option!')

  # delete a single health record using record id  
  if id:
    return await HealthMonitorings.delete_patient_health_record_admin(id, db)

  # delete a batch of health records using multiple ids 
  if ids:
    return await HealthMonitorings.delete_patient_health_record_batch_admin(ids, db)



