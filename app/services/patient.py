import json
from redis import Redis
from sqlalchemy import func
from sqlalchemy.orm import Session, defer
from fastapi import HTTPException, Query


from app.models import User, Patient
from app.core.utils import ResponseHandler
from app.core.security import (
    base64_to_uuid,
    uuid_to_base64,
    decrypt,
    verify_password,
    generate_hash,
)
from app.schemas.users import (
    UserResponse,
    UserUpdate,
    UserPasswordChange,
    PatientCreateAdmin,
    PatientResponseAdmin,
    PatientUpdateAdmin,
)


class PatientService:
    @staticmethod
    async def get_patient_information(session_user: Patient, redis: Redis):
        if cached_profile := redis.get(
            f"profile_info_{session_user.id}"
        ):  # return patient profile cache if available
            result = json.loads(cached_profile)
            return ResponseHandler.fetch_successful(
                f"sucessfully retrieved patient profile using caching - {session_user.id}",
                result,
            )

        # restructure the patient profile informations
        profile_data = {
            "id": uuid_to_base64(str(session_user.id)),
            "email": session_user.email,
            "name": session_user.name,
            "profession": session_user.profession,
            "gender": session_user.gender,
            "img_src": session_user.img_src,
            "date_of_birth": session_user.date_of_birth,
            "address": session_user.address,
            "contact_number": session_user.contact_number,
            "emergency_number": session_user.emergency_number,
        }

        # set the patient information into redis caching
        profile_json = json.dumps(profile_data)
        redis.set(f"profile_info_{session_user.id}", profile_json)

        return ResponseHandler.fetch_successful(
            f"successfully retrieved patient profile - {session_user.id}", profile_data
        )

    # handle updating patient information /patient
    @staticmethod
    async def change_patient_information(
        id: str, updated_data: UserUpdate, session_user: Patient, db: Session
    ):
        user_id = base64_to_uuid(id)  # get the original uuid from the url

        # check if requested user matches w session user
        if user_id != session_user.id:
            raise ResponseHandler.no_permission(f"user does not have permission - {id}")

        # custom error for empty body
        if updated_data.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"updating profile information failed, no field was provided - {user_id}",
            )

        # update the patient information
        payload = {"updated_at": func.now(), **updated_data.none_excluded()}
        user_payload = {
            key: val for key, val in payload.items() if key in User.__table__.columns
        }
        patient_payload = {
            key: val for key, val in payload.items() if key in Patient.__table__.columns
        }

        if user_payload:
            db.query(User).where(User.id == user_id).update(user_payload)

        if patient_payload:
            db.query(Patient).where(Patient.id == user_id).update(patient_payload)

        session_user = db.query(Patient).where(Patient.id == user_id).first()

        db.commit()
        db.refresh(session_user)

        return {
            "status": "successful",
            "message": f"successfully updated profile information - {user_id}",
            "data": {
                "id": uuid_to_base64(session_user.id),
                "email": session_user.email,
                "name": session_user.name,
                "profession": session_user.profession,
                "gender": session_user.gender,
                "img_src": session_user.img_src,
                "date_of_birth": session_user.date_of_birth,
                "address": session_user.address,
                "contact_number": session_user.contact_number,
                "emergency_number": session_user.emergency_number,
            },
        }

    # handle updating account password /default
    @staticmethod
    async def change_user_password(
        updated_data: UserPasswordChange, session_user: Patient, db: Session
    ):
        # decrypt the passwords from the client
        decrypted_old_pass = await decrypt(updated_data.old_password)
        decrypted_new_pass = await decrypt(updated_data.new_password)

        # verify user old password
        if not verify_password(decrypted_old_pass, session_user.password):
            raise HTTPException(
                status_code=400, detail=f"old password is incorrect - {session_user.id}"
            )

        # generate the new hashed password
        new_hashed_pass = generate_hash(decrypted_new_pass)

        # update the password
        payload = {"password": new_hashed_pass, "updated_at": func.now()}
        db.query(User).where(User.id == session_user.id).update(payload)
        db.commit()

        return {
            "status": "successful",
            "message": f"successfully updated password - {session_user.id}",
        }

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
