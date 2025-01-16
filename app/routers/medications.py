from redis import Redis
from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Patient
from app.db import get_async_db as db
from app.services.medication import MedicationService
from app.core.dependecies import include_auth, cache
from app.schemas.medication import (
    UpdateMedication,
    GenerateMedication,
)


router = APIRouter()


@router.get("/suggestions")
async def retrieve_patient_medications(
    session_user: Patient = Security(
        include_auth, scopes=["patient:read", "medication:read"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    return await MedicationService.get_patient_medications(session_user, db, redis)


@router.post("/generate")
async def generate_suggestions(
    payload: GenerateMedication,
    session_user: Patient = Security(
        include_auth,
        scopes=[
            "patient:read",
            "medication:read",
            "medication:write",
        ],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    return await MedicationService.generate_by_system(payload, session_user, db, redis)


@router.get("/appointment")
async def retrieve_apponintment_medications(
    id: str,
    _: Patient = Security(
        include_auth, scopes=["patient:read", "appointment:read", "medication:read"]
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    return await MedicationService.appointment_medication_by_id(id, db, redis)


@router.put("/suggestions")
async def create_new_patient_medication(
    payload: UpdateMedication,
    session_user: Patient = Security(
        include_auth,
        scopes=[
            "patient:read",
            "medication:read",
            "medication:write",
            "medication:update",
        ],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
):
    return await MedicationService.update_patient_medications(
        payload, session_user, db, redis
    )
