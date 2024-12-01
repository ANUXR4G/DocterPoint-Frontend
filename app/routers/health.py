from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends

from app.models import Patient
from app.db import get_db as db
from app.core.dependecies import include_auth
from app.services.health import HealthMonitorings, HealthRecordUpdate, BloodPressure, BloodGlucose


router = APIRouter()


# get health record using patient id 
@router.get('/records')
async def get_patient_health_records(
  id: str, 
  session_user: Patient = Depends(include_auth),
  db: Session = Depends(db)
):
  return await HealthMonitorings.get_health_record_details(id, session_user, db)


# create health record using patient id 
@router.post('/records', status_code=201)
async def create_patient_health_records(
  health_records: HealthRecordUpdate, 
  id: str, 
  session_user: Patient = Depends(include_auth),
  db: Session = Depends(db)
):
  return await HealthMonitorings.create_health_record_details(health_records, id, session_user, db)


# update health record using record id 
@router.put('/records')
async def update_patient_health_records(
  updated_data: HealthRecordUpdate, 
  id: str,
  db: Session = Depends(db), 
  session_user: Patient = Depends(include_auth)
):
  return await HealthMonitorings.update_health_record_by_id(updated_data, id, session_user, db)



# update patient blood pressure records 
@router.put('/records/pressure')
async def update_patient_blood_pressure_records(
  updated_data: BloodPressure,
  id: str,
  session_user: Patient = Depends(include_auth),
  db: Session = Depends(db)
):
  return await HealthMonitorings.update_blood_pressure_by_id(updated_data, id, session_user, db)


# update patient blood glucose records 
@router.put('/records/glucose')
async def update_patient_blood_glucose_records(
  updated_data: BloodGlucose,
  id: str,
  session_user: Patient = Depends(include_auth),
  db: Session = Depends(db)
):
  return await HealthMonitorings.update_blood_glucose_by_id(updated_data, id, session_user, db) 

