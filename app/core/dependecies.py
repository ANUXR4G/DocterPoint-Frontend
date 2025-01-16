import redis
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, SecurityScopes
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import verify_token
from app.core.utils import ResponseHandler
from app.db import get_async_db as db
from sqlalchemy.orm import defer
from app.core.config import settings
from app.models import Patient, Doctor


http_bearer = HTTPBearer()


def cache():
    return redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
    )


async def include_auth(
    security_scopes: SecurityScopes,
    db: AsyncSession = Depends(db),
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
):
    """
    Authenticate and authorize user based on token and security scopes.
    """
    if credentials.scheme != "Bearer":
        raise ResponseHandler.invalid_token()

    user = await verify_token(credentials.credentials, db, security_scopes.scopes)

    if user.role == "user":
        query = (
            select(Patient)
            .where(Patient.id == user.id)
            .options(
                defer(Patient.password),  # exclude password
                defer(Patient.created_at),  # exclude created_at
                defer(Patient.created_by),  # exclude created_by
                defer(Patient.updated_at),  # exclude updated_at
            )
        )
        result = await db.execute(query)
        user = result.scalar_one_or_none()

    if user.role == "doctor":
        query = select(Doctor).where(Doctor.id == user.id)
        result = await db.execute(query)
        user = result.scalar_one_or_none()

    if not user:
        raise ResponseHandler.invalid_token()

    return user


# def include_admin(
#     db: Session = Depends(get_db),
#     credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
# ):
#     if credentials.scheme != "Bearer":
#         raise ResponseHandler.invalid_token()

#     user = verify_token(credentials.credentials, db)

#     if not user:
#         raise ResponseHandler.invalid_token()

#     if not user.role == "admin":
#         raise ResponseHandler.no_permission(f"user-{user.id} does not have permission!")

#     return user
