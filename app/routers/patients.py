from redis import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, APIRouter, Depends, Security


from app.models import Patient
from app.db import get_async_db as db
from app.services.patient import PatientService
from app.core.dependecies import include_auth, cache
from app.schemas.users import UserUpdate, UserPasswordChange


router = APIRouter()


# get a patient profile information by id
@router.get("/profile")
async def retrieve_patient_profile(
    session_user: Patient = Security(include_auth, scopes=["patient:read"]),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    return await PatientService.get_profile_info(session_user, db, redis)


# change a patient profile information by id
@router.put("/profile")
async def update_patient_account_information(
    updated_data: UserUpdate,
    session_user: Patient = Security(
        include_auth, scopes=["patient:read", "patient:update"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    return await PatientService.change_patient_information(
        updated_data, session_user, db, redis
    )


# change user password
@router.put("/profile/password")
async def change_patient_account_password(
    updated_data: UserPasswordChange,
    session_user: Patient = Security(
        include_auth, scopes=["patient:read", "patient:update"]
    ),
    db: AsyncSession = Depends(db),
):
    try:
        return await PatientService.change_user_password(updated_data, session_user, db)
    except Exception:
        raise HTTPException(
            status_code=403, detail="something went wrong while changing the password."
        )
