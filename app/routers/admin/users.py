from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db as db
from app.services.user import UserService
from app.core.utils import ResponseHandler
from app.schemas.users import UserAdminCreate, UserAdminUpdate


router = APIRouter()


# get all the user details /admin
@router.get('/all')
async def get_all_users_admin(
  offset: int = None, 
  limit: int = None, 
  db: Session = Depends(db)
):
  return await UserService.retrieve_all_users(db, offset, limit)



# get a profile of a user by id /admin
@router.get('/profile')
async def get_user_admin(id: str, db: Session = Depends(db)):
  return await UserService.get_user_by_id(id, db)



# create a new user /admin
@router.post('/new', status_code=201)
async def create_user_admin(user: UserAdminCreate, db: Session = Depends(db)):
  return await UserService.create_new_user(user, db)



# update profile of a user by id /admin
@router.put('/profile')
async def update_user_admin(id: str, updated_data: UserAdminUpdate, db: Session = Depends(db)):
  return await UserService.update_user_by_id(id, updated_data, db)



# delete profile of user by id or ids /admin
@router.delete('/profile')
async def delete_user_admin(id: str | None = None, ids: List[str] | None = None, db: Session = Depends(db)):
  if id and ids:
    raise ResponseHandler.no_permission('choose either single or batch delete option!')
  
  # delete a single user by id 
  if id:
    return await UserService.delete_user_by_id(id, db)

  # delete a batch of users by multiple ids 
  if ids:
    return await UserService.delete_user_batch(ids, db)



