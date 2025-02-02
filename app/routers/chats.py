from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, Query, Security

from app.db import get_async_db as db
from app.services.chat import ChatService
from app.core.dependecies import include_auth


router = APIRouter()


@router.get("/user/{user_id}")
async def retrieve_user_help_chats(
    user_id: str,
    _=Security(include_auth, scopes=["users:chat"]),
    db: AsyncSession = Depends(db),
    page: int = 1,
    limit: int = Query(default=10, le=100),
):
    """
    Retrieve a list of messages b/w Users and Admins.
    """
    return await ChatService.get_user_help_messages(db, page, limit, user_id)
