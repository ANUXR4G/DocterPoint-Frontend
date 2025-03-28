from redis import Redis

from fastapi import Depends, APIRouter, Query, Security

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Patient
from app.core.dependecies import include_auth
from app.db import get_async_db as db
from app.core.dependecies import cache
from app.services.meal import MealService


router = APIRouter()


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
    Retrieve all available meals for the logged-in patient.
    -------------------------------------------------------

    Parameters:
    -----------
    - session_user (Patient): The authenticated patient making the request, authorized with the required security scope ["patient:read"].
    - db (AsyncSession): The asynchronous database session used for querying meal data.
    - redis (Redis): The Redis instance used for caching to enhance performance and reduce database load.
    - q (str | None): The optional search query to filter meals by name or other criteria. Default is None.
    - page (int): The page number for paginated results. Default is 1.
    - limit (int): The maximum number of meals to retrieve per page, up to 100. Default is 10.
    - category (str | None): The optional category to filter meals by specific types. Default is None.

    Returns:
    --------
    - A paginated list of meals matching the specified criteria, retrieved and processed using the appropriate services.

    """

    return await MealService.retrieve_all(
        session_user, db, redis, q, page, limit, category
    )
