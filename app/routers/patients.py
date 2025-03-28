from redis import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, APIRouter, Depends, Security


from app.models import Patient
from app.db import get_async_db as db
from app.services.patient import PatientService
from app.core.dependecies import include_auth, cache
from app.schemas.users import UserUpdate, UserPasswordChange


router = APIRouter()


@router.get("/profile")
async def retrieve_patient_profile(
    session_user: Patient = Security(include_auth, scopes=["patient:read"]),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Retrieve the profile information of the logged-in patient.
    ----------------------------------------------------------

    Parameters:
    -----------
    - session_user (Patient): The authenticated patient making the request, authorized with the required security scope ["patient:read"].
    - db (AsyncSession): The asynchronous database session used for querying the patient's profile information.
    - redis (Redis): The Redis instance used for caching to enhance performance and reduce database load.

    Returns:
    --------
    - The profile information of the patient, retrieved and processed using the appropriate services.

    """

    return await PatientService.get_profile_info(session_user, db, redis)


@router.put("/profile")
async def update_patient_account_information(
    updated_data: UserUpdate,
    session_user: Patient = Security(
        include_auth, scopes=["patient:read", "patient:update"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    """
    Update the account information of the logged-in patient.
    --------------------------------------------------------

    Parameters:
    -----------
    - updated_data (UserUpdate): The input payload containing the updated account information for the patient.
    - session_user (Patient): The authenticated patient making the request, authorized with the required security scopes ["patient:read", "patient:update"].
    - db (AsyncSession): The asynchronous database session used for updating the patient's information in the database.
    - redis (Redis): The Redis instance used for caching to enhance performance and synchronize data.

    Returns:
    --------
    - Confirmation of the successful update of the patient's account information.

    """

    return await PatientService.change_patient_information(
        updated_data, session_user, db, redis
    )


@router.put("/profile/password")
async def change_patient_account_password(
    updated_data: UserPasswordChange,
    session_user: Patient = Security(
        include_auth, scopes=["patient:read", "patient:update"]
    ),
    db: AsyncSession = Depends(db),
):
    """
    Change the account password for the logged-in patient.
    ------------------------------------------------------

    Parameters:
    -----------
    - updated_data (UserPasswordChange): The input payload containing the current password and the new password to be updated.
    - session_user (Patient): The authenticated patient making the request, authorized with the required security scopes ["patient:read", "patient:update"].
    - db (AsyncSession): The asynchronous database session used for updating the password in the database.

    Returns:
    --------
    - Confirmation of the successful password change for the patient's account.

    """

    try:
        return await PatientService.change_user_password(updated_data, session_user, db)
    except Exception:
        raise HTTPException(
            status_code=403, detail="something went wrong while changing the password."
        )
