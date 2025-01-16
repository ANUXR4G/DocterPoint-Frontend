from fastapi import Depends, APIRouter, Query, Security
from redis import Redis

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Patient
from app.core.dependecies import include_auth
from app.db import get_async_db as db
from app.core.dependecies import cache
from app.services.meal import MealService


router = APIRouter()


# retrieve all the meal details
@router.get("/meal")
async def retrieve_all_meals(
    session_user: Patient = Security(
        include_auth,
        scopes=["patient:read"],
    ),
    db: AsyncSession = Depends(db),
    redis: Redis = Depends(cache),
    q: str | None = None,
    page: int = 1,
    limit: int = Query(default=10, le=100),
    category: str | None = None,
):
    """
    Retrieve a list of meals based on various optional search criteria.
    """

    return await MealService.retrieve_all(
        session_user, db, redis, q, page, limit, category
    )
