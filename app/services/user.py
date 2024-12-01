from typing import List
from sqlalchemy import func
from fastapi import Query, HTTPException
from sqlalchemy.orm import Session, defer

from app.models import User
from app.core.utils import ResponseHandler
from app.core.security import decrypt, generate_hash
from app.schemas.users import UserAdminCreate, UserAdminResponse, UserAdminUpdate


class UserService:
  @staticmethod
  async def retrieve_all_users(
    db: Session,
    offset: int = 0, 
    # this way it adds a layer of constraint, asking the parameter either be 100 or less than 100
    limit: int = Query(default=100, le=100),
  ):
    users = db.query(User).offset(offset).limit(limit).options(defer(User.password)).all()
    
    return {
      "status": "successful",
      "message": "successfully fetched all users!",
      "data": users,
    } 


  # create a new user account /admin 
  @staticmethod
  async def create_new_user(user_data: UserAdminCreate, db: Session):
    exits = db.query(User).where(User.email == user_data.email).first()
    
    # check if the user exists
    if exits:
      raise HTTPException(
        status_code=409, 
        detail=f'user already exists - {user_data.email}'
      )
    
    decrypted_password = await decrypt(user_data.password) # decrypt the password from the client
    
    # generate hashed password
    hashed_password = generate_hash(decrypted_password)
    user_data.password = hashed_password

    payload = { 'created_by': 'admin', **user_data.model_dump() }

    # create a new user w the hashed password
    new_user = User(**payload)
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
      "status": "successful",
      "message": f'successfully created a new user - {new_user.id}',
      "data": UserAdminResponse(
        id=str(new_user.id),
        email=new_user.email,
        name=new_user.name,
        role=new_user.role,
        gender=new_user.gender,
        address=new_user.address,
        created_at=new_user.created_at,
        updated_at=new_user.updated_at,
        created_by=new_user.created_by,
      )
    }
  

  # get user account informations by id /admin
  @staticmethod
  async def get_user_by_id(id: str, db: Session):
    user = db.query(User).where(User.id == id).first()
    
    # if no user was found 
    if not user:
      raise ResponseHandler.not_found_error(f'user not found - {id}')
    
    return UserAdminResponse(
      id=str(user.id),
      email=user.email,
      name=user.name,
      role=user.role,
      gender=user.gender,
      address=user.address,
      created_at=user.created_at,
      updated_at=user.updated_at,
      created_by=user.created_by,
    )
    


  # update user account informations by id /admin
  @staticmethod
  async def update_user_by_id(id: str, updated_data: UserAdminUpdate, db: Session):
    # get the user 
    user = db.query(User).where(User.id == id).first()
    
    # if no user found 
    if not user:
      raise ResponseHandler.not_found_error(f'user not found - {id}')
    
    if(updated_data.is_empty()):
      raise HTTPException(
        status_code=400,
        detail=f"updating user-{id} failed, no field was provided!"
      )
    
    # check if the password is given or not
    if updated_data.password:
      decrypted_new_pass = await decrypt(updated_data.password)
      new_hashed_pass = generate_hash(decrypted_new_pass)
      updated_data.password = new_hashed_pass

    # update the user 
    updated_payload = { "updated_at": func.now(), **updated_data.none_excluded() }
    
    db.query(User).where(User.id == id).update(updated_payload)
    db.commit()
    db.refresh(user)

    return {
      "status": "successful",
      "message": f"successfully updated user-{user.id} profile!",
      "data": UserAdminResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        gender=user.gender,
        address=user.address,
        created_at=user.created_at,
        updated_at=user.updated_at
      ) 
    }


  # delete user account by id /admin
  @staticmethod
  async def delete_user_by_id(id: str, db: Session):
    targeted_user = db.query(User).where(User.id == id).first()
  
    if not targeted_user:
      raise ResponseHandler.not_found_error(f'user not found - {id}')
    
    db.delete(targeted_user)
    db.commit()

    return {
      "status": "successful",
      "message": f"successfully deleted user account - {id}"
    }
  


  # delete a batch of user accounts /admin
  @staticmethod
  async def delete_user_batch(ids: List[str], db: Session):
    # get the target users w the ids 
    targeted_users = db.query(User).filter(User.id.in_(ids)).all()
    
    # get the missing ids if there is any
    existing_ids = [str(user.id) for user in targeted_users]
    missing_ids = list(set(ids) - set(existing_ids))
    missing_message = None

    # if targeted users not found
    if len(existing_ids) == 0:
      raise ResponseHandler.not_found_error("user " +  ", ".join(missing_ids) + " has not been found!")

    # delete the targeted users 
    db.query(User).filter(User.id.in_(ids)).delete(synchronize_session=False)
    db.commit()

    # custom message when some of the ids are missing 
    if len(missing_ids) > 0:
      missing_message = "user " + ", ".join(missing_ids) + " not found!"
     
    # message w custom message if there is any
    custom_message = "user " + ", ".join(existing_ids) + " has been deleted successfully" + (" and " + missing_message if missing_message else "!")
   
    return {
      "status": "successful",
      "message": custom_message
    }