from fastapi import HTTPException, Query
from sqlalchemy.orm import Session, joinedload, defer
from sqlalchemy import func

from app.core.security import decrypt, generate_hash
from app.models import User, Doctor, Hospital
from app.core.utils import ResponseHandler
from app.schemas.doctor import DoctorCreateAdmin, DoctorUpdateAdmin, DoctorResponse


class DoctorServiceAdmin:
    # create a new doctor account /admin
    @staticmethod
    async def new_doctor_account_admin(
        details: DoctorCreateAdmin, hospital_id: str, db: Session
    ):
        hospital = db.query(Hospital).where(Hospital.id == hospital_id).first()

        if not hospital:
            raise ResponseHandler.not_found_error(f"hospital not found - {hospital_id}")

        exits = db.query(Doctor).where(Doctor.email == details.email).first()

        # check if the doctor account already exists
        if exits:
            raise HTTPException(
                status_code=409,
                detail=f"an account with this email already exists - {details.email}",
            )

        decrypted_password = await decrypt(
            details.password
        )  # decrypt the password from the client

        # generate hashed password
        hashed_password = generate_hash(decrypted_password)
        details.password = hashed_password

        details.emails = [details.email, *hospital.emails]
        details.contact_numbers = [*details.contact_numbers, *hospital.contact_numbers]

        payload = {
            "created_by": "admin",
            "hospital_id": hospital.id,
            "role": "doctor",
            **details.model_dump(),
        }

        # create a new user w the hashed password
        new_doctor = Doctor(**payload)

        db.add(new_doctor)
        db.commit()
        db.refresh(new_doctor)

        return {
            "status": "successful",
            "message": f"successfully created a new doctor account - {new_doctor.id}",
        }

    # retrieve all doctor accounts  /admin
    @staticmethod
    async def retrieve_all_doctors_admin(
        db: Session,
        offset: int = 0,
        # this way it adds a layer of constraint, asking the parameter either be 100 or less than 100
        limit: int = Query(default=100, le=100),
    ):
        doctors = (
            db.query(Doctor)
            .offset(offset)
            .limit(limit)
            .options(
                defer(Doctor.password),
                joinedload(Doctor.hospital).load_only(
                    Hospital.id, Hospital.name, Hospital.city, Hospital.address
                ),
            )
            .all()
        )

        return {
            "status": "successful",
            "message": "successfully fetched all doctors!",
            "data": doctors,
        }

    # get doctor information using doctor id /admin
    @staticmethod
    async def get_doctor_information_admin(doctor_id: str, db: Session):
        doctor = (
            db.query(Doctor)
            .where(Doctor.id == doctor_id)
            .options(
                defer(Doctor.password),
                joinedload(Doctor.hospital).load_only(
                    Hospital.id, Hospital.name, Hospital.city, Hospital.address
                ),
            )
            .first()
        )

        if not doctor:
            raise ResponseHandler.not_found_error(f"doctor not found - {doctor_id}")

        return {
            "status": "successful",
            "message": f"successfully retrieved doctor information - {doctor.id}",
            "data": doctor,
        }

    # update doctor information using doctor id /admin
    @staticmethod
    async def update_doctor_information_admin(
        doctor_id: str, details: DoctorUpdateAdmin, db: Session
    ):
        doctor = db.query(Doctor).where(Doctor.id == doctor_id).first()

        # check if the doctor exists
        if not doctor:
            raise ResponseHandler.not_found_error(f"doctor not found - {doctor_id}")

        if details.is_empty():
            raise HTTPException(
                status_code=400,
                detail=f"updating doctor failed, no field was provided - {doctor.id}",
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
        doctor_payload = {
            key: val for key, val in payload.items() if key in Doctor.__table__.columns
        }

        if user_payload:
            db.query(User).where(User.id == doctor.id).update(user_payload)

        if doctor_payload:
            db.query(Doctor).where(Doctor.id == doctor.id).update(doctor_payload)

        db.commit()
        db.refresh(doctor)

        doctor_informations = (
            db.query(Doctor)
            .where(Doctor.id == doctor_id)
            .options(
                defer(Doctor.password),
                joinedload(Doctor.hospital).load_only(
                    Hospital.id, Hospital.name, Hospital.city, Hospital.address
                ),
            )
            .first()
        )

        return {
            "status": "successful",
            "message": f"successfully updated doctor information - {doctor.id}",
            "data": doctor_informations,
        }

    # retrieve doctor accounts by hospital id /admin
    @staticmethod
    async def retrieve_doctors_by_hospital_admin(
        hospital_id: str,
        db: Session,
        offset: int = 0,
        limit: int = Query(default=25, le=100),
    ):
        doctors = (
            db.query(Doctor)
            .where(Doctor.hospital_id == hospital_id)
            .offset(offset)
            .limit(limit)
            .options(
                defer(Doctor.password),
                joinedload(Doctor.hospital).load_only(
                    Hospital.id, Hospital.name, Hospital.city, Hospital.address
                ),
            )
            .all()
        )

        return {
            "status": "successful",
            "message": f"successfully fetched all doctors from hospital - {hospital_id}",
            "data": doctors,
        }
