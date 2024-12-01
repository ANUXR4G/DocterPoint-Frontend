import redis
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, SecurityScopes
from sqlalchemy.orm import Session

from app.core.security import verify_token
from app.core.utils import ResponseHandler, scopes
from app.db import get_db
from app.core.config import settings
from app.models import Patient


http_bearer = HTTPBearer()


def include_auth(
  security_scopes: SecurityScopes,
  db: Session = Depends(get_db), 
  credentials: HTTPAuthorizationCredentials = Depends(http_bearer), 
):
  if credentials.scheme != "Bearer":
    raise ResponseHandler.invalid_token()
  
  user = verify_token(credentials.credentials, db, security_scopes.scopes)
  
  if not user:
    raise ResponseHandler.invalid_token()
  
  patient = db.query(Patient).where(Patient.id == user.id).first()

  patient_scopes = scopes.get(user.role, [])
  
  if not set(security_scopes.scopes).issubset(set(patient_scopes)):
    raise ResponseHandler.no_permission(f"user doesn't have enough permission")

  if not patient:
    raise HTTPException(
      status_code=400,
      detail='something went wrong!'
    )
  
  return patient


def include_admin(db: Session = Depends(get_db), credentials: HTTPAuthorizationCredentials = Depends(http_bearer)):
  if credentials.scheme != "Bearer":
    raise ResponseHandler.invalid_token()
  
  user = verify_token(credentials.credentials, db)
  
  if not user:
    raise ResponseHandler.invalid_token()
  
  
  if not user.role == "admin":
    raise ResponseHandler.no_permission(f'user-{user.id} does not have permission!')
  
  return user 


def cache():
  return redis.Redis(
    host=settings.redis_host,
    port=settings.redis_port,
  )