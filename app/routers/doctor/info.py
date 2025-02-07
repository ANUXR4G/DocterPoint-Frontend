from redis import Redis

from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, Security

from app.services.doctor.info import InfoService
from app.core.dependecies import include_auth, cache
from app.db import get_async_db as db
from app.models import Doctor
from app.core.security import uuid_to_base64

router = APIRouter()


@router.get("/info")
async def retrieve_doctor_profile_info(
    session_user: Doctor = Security(
        include_auth, scopes=["doctor:read", "doctor:update"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    return await InfoService.get_info(session_user, db, redis)
