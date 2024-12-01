from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Patient, Doctor, Hospital
from app.core.security import generate_hash
from app.core.dummy import patients_data, hospitals_data, doctors_data
import asyncio


async def seed_db():
  db: Session = next(get_db())
  
  # seed the patient informations in the database 
  for patient in patients_data:
    existing_patient = db.query(Patient).where(Patient.email == patient['email']).first()
    if not existing_patient:
      # generate hashed password
      hashed_password = generate_hash('test123')
      patient['password'] = hashed_password
      new_patient = Patient(**patient)
      db.add(new_patient)
  
  
  # seed the hospital informations in the database 
  for hospital in hospitals_data:
    new_hospital = Hospital(**hospital)
    db.add(new_hospital)


  db.commit()
  print('successfully seeded patient informations into database!')
  print('successfully seeded hospital informations into database!')
  
  
  # seed the doctor informations in the databae  
  for doctor in doctors_data:
    existing_doctor = db.query(Doctor).where(Doctor.email == doctor['email']).first()
    if not existing_doctor:
      # generate hashed password
      hashed_password = generate_hash('test123')
      doctor['password'] = hashed_password
      # get the hospital id 
      hospital_id_row = db.query(Hospital.id).where(Hospital.name == doctor['hospital_name']).first()
      
      # restructure the doctor payload (include hosptial id / exclude hospital_name)
      if hospital_id_row:
        payload = { "hospital_id": hospital_id_row[0], **{ key: val for key, val in doctor.items() if key != 'hospital_name' } }
        new_doctor = Doctor(**payload)
        db.add(new_doctor)
      
      
  db.commit()
  print('successfully seeded doctor informations into database!')
  
  

if __name__ == "__main__":
  asyncio.run(seed_db())