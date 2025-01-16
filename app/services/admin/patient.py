from sqlalchemy.orm import Session, defer
from fastapi import HTTPException, Query
from sqlalchemy import func
from app.core.utils import ResponseHandler


from app.models import User, Patient
from app.core.security import (
    decrypt,
    generate_hash,
)
from app.schemas.users import (
    PatientCreateAdmin,
    PatientResponseAdmin,
    PatientUpdateAdmin,
)


class PatientServiceAdmin:
    # retrieve all patient informations
    @staticmethod
    async def retrieve_all_patients_admin(
        db: Session,
        offset: int = 0,
        # this way it adds a layer of constraint, asking the parameter either be 100 or less than 100
        limit: int = Query(default=100, le=100),
    ):
        patients = (
            db.query(Patient)
            .offset(offset)
            .limit(limit)
            .options(defer(Patient.password))
            .all()
        )

        return {
            "status": "successful",
            "message": "successfully fetched all patients!",
            "data": patients,
        }

    # create a new patient account /admin
    @staticmethod
    async def create_patient_account_admin(
        patient_data: PatientCreateAdmin, db: Session
    ):
        exits = db.query(User).where(User.email == patient_data.email).first()

        # check if the user exists
        if exits:
            raise HTTPException(
                status_code=409, detail=f"patient already exists - {patient_data.email}"
            )

        decrypted_password = await decrypt(
            patient_data.password
        )  # decrypt the password from the client

        # generate hashed password
        hashed_password = generate_hash(decrypted_password)
        patient_data.password = hashed_password

        payload = {"created_by": "admin", **patient_data.model_dump()}

        # create a new user w the hashed password
        new_patient = Patient(**payload)

        db.add(new_patient)
        db.commit()
        db.refresh(new_patient)

        return {
            "status": "successful",
            "message": f"successfully created a new patient - {new_patient.id}",
        }

    # get patient information using id /admin
    @staticmethod
    async def get_patient_information_admin(id: str, db: Session):
        patient = db.query(Patient).where(Patient.id == id).first()

        if not patient:
            raise ResponseHandler.not_found_error(f"patient not found - {id}")

        return {
            "status": "successful",
            "message": f"successfully retrieved patient information - {patient.id}",
            "data": PatientResponseAdmin(
                id=str(patient.id),
                email=patient.email,
                name=patient.name,
                gender=patient.gender,
                address=patient.address,
                date_of_birth=patient.date_of_birth,
                profession=patient.profession,
                contact_number=patient.contact_number,
                emergency_number=patient.emergency_number,
                created_at=patient.created_at,
                updated_at=patient.updated_at,
            ),
        }

    # update patient information using id /admin
    @staticmethod
    async def update_patient_information_admin(
        id: str, details: PatientUpdateAdmin, db: Session
    ):
        patient = db.query(Patient).where(Patient.id == id).first()

        # if no patient found
        if not patient:
            raise ResponseHandler.not_found_error(f"patient not found - {id}")

        if details.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"updating patient failed, no field was provided - {patient.id}",
            )

        # check if the password is given or not
        if details.password:
            decrypted_new_pass = await decrypt(details.password)
            new_hashed_pass = generate_hash(decrypted_new_pass)
            details.password = new_hashed_pass

        # update the patient information
        payload = {"updated_at": func.now(), **details.none_excluded()}
        user_payload = {
            key: val for key, val in payload.items() if key in User.__table__.columns
        }
        patient_payload = {
            key: val for key, val in payload.items() if key in Patient.__table__.columns
        }

        if user_payload:
            db.query(User).where(User.id == id).update(user_payload)

        if patient_payload:
            db.query(Patient).where(Patient.id == id).update(patient_payload)

        db.commit()
        db.refresh(patient)

        return {
            "status": "successful",
            "message": f"successfully updated patient information - {patient.id}",
            "data": PatientResponseAdmin(
                id=str(patient.id),
                email=patient.email,
                name=patient.name,
                gender=patient.gender,
                address=patient.address,
                date_of_birth=patient.date_of_birth,
                profession=patient.profession,
                contact_number=patient.contact_number,
                emergency_number=patient.emergency_number,
                created_at=patient.created_at,
                updated_at=patient.updated_at,
            ),
        }
