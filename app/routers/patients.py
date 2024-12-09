from redis import Redis
from sqlalchemy.orm import Session
from fastapi import HTTPException, APIRouter, Depends, Security


from app.models import Patient
from app.db import get_db as db
from app.services.patient import PatientService
from app.core.dependecies import include_auth, cache
from app.schemas.users import UserUpdate, UserPasswordChange


router = APIRouter()


# get a patient profile information by id
@router.get("/profile")
async def get_patient_account_information(
    session_user: Patient = Security(include_auth, scopes=["patient:read"]),
    redis: Redis = Depends(cache),
):
    return await PatientService.get_patient_information(session_user, redis)


# change a patient profile information by id
@router.put("/profile")
async def update_patient_account_information(
    id: str,
    updated_data: UserUpdate,
    db: Session = Depends(db),
    session_user: Patient = Security(include_auth, scopes=["patient:update_profile"]),
):
    return await PatientService.change_patient_information(
        id, updated_data, session_user, db
    )


# change user password
@router.put("/profile/password")
async def change_patient_account_password(
    updated_data: UserPasswordChange,
    db: Session = Depends(db),
    session_user: Patient = Security(include_auth, scopes=["patient:update_password"]),
):
    try:
        return await PatientService.change_user_password(updated_data, session_user, db)
    except Exception:
        raise HTTPException(
            status_code=403, detail="you're not allowed to change the password!"
        )
