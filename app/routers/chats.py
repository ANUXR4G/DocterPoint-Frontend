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
    Retrieve help chat messages for a specific user.
    ------------------------------------------------

    Parameters:
    -----------
    - user_id (str): The unique identifier of the user whose help chat messages are to be retrieved.
    - _ (Security): The security context for the authenticated user, with the required scope ["users:chat"].
    - db (AsyncSession): The asynchronous database session used for querying the help chat messages.
    - page (int): The page number for paginated results. Default is 1.
    - limit (int): The maximum number of chat messages to retrieve per page, up to 100. Default is 10.

    Returns:
    --------
    - A paginated list of help chat messages associated with the specified user.

    """

    return await ChatService.get_user_help_messages(db, page, limit, user_id)


@router.get("/{user_id}/{receiver_id}")
async def retrieve_user_direct_chats(
    user_id: str,
    receiver_id: str,
    _=Security(include_auth, scopes=["users:chat"]),
    db: AsyncSession = Depends(db),
    page: int = 1,
    limit: int = Query(default=10, le=100),
):
    """
    Retrieve direct chat messages between two users.
    ------------------------------------------------

    Parameters:
    -----------
    - user_id (str): The unique identifier of the user requesting the direct chat messages.
    - receiver_id (str): The unique identifier of the other user involved in the direct chat.
    - _ (Security): The security context for the authenticated user, with the required scope ["users:chat"].
    - db (AsyncSession): The asynchronous database session used for querying the direct chat messages.
    - page (int): The page number for paginated results. Default is 1.
    - limit (int): The maximum number of chat messages to retrieve per page, up to 100. Default is 10.

    Returns:
    --------
    - A paginated list of direct chat messages exchanged between the two users, retrieved using the `ChatService`.

    """

    return await ChatService.get_user_direct_messages(
        db, page, limit, user_id, receiver_id
    )
