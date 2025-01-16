from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    def none_excluded(self):
        return {k: v for k, v in self.model_dump().items() if v is not None}

    def is_empty(self) -> bool:
        return all(value is None for value in self.model_dump().values())

    pass


class UserCredentials(UserBase):
    email: EmailStr
    password: str


class UserUpdate(UserBase):
    email: EmailStr = None
    name: str = None
    profession: str = None
    gender: str = None
    date_of_birth: str = None
    address: str = None
    contact_number: str = None
    emergency_number: str = None


class UserPasswordChange(BaseModel):
    old_password: str
    new_password: str


class UserResponse(BaseModel):
    url: str
    email: EmailStr
    name: str | None = None
    profession: str | None = None
    gender: str | None = None
    date_of_birth: str | None = None
    address: str | None = None
    contact_number: str | None = None
    emergency_number: str | None = None


# google user
class UserLoginGoogle(BaseModel):
    name: str
    email: str
    picture: str = None


# admin user
class UserAdminCreate(UserCredentials):
    role: str = None
    name: str = None
    gender: str = None
    address: str = None
    img_src: str = None


class UserAdminResponse(UserBase):
    id: str
    email: EmailStr
    role: str
    name: str | None = None
    gender: str | None = None
    address: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class UserAdminUpdate(UserBase):
    email: EmailStr = None
    password: str = None
    name: str = None
    role: str = None
    gender: str = None
    address: str = None


# admin patient
class PatientCreateAdmin(UserCredentials):
    name: str = None
    gender: str = None
    img_src: str = None
    address: str = None
    date_of_birth: str = None
    profession: str = None
    contact_number: str = None
    emergency_number: str = None


class PatientResponseAdmin(BaseModel):
    id: str
    email: EmailStr
    name: str | None = None
    gender: str | None = None
    address: str | None = None
    date_of_birth: str | None = None
    profession: str | None = None
    contact_number: str | None = None
    emergency_number: str | None = None
    created_at: datetime
    updated_at: datetime


class PatientUpdateAdmin(UserBase):
    email: EmailStr = None
    password: str = None
    name: str = None
    gender: str = None
    address: str = None
    date_of_birth: str = None
    profession: str = None
    contact_number: str = None
    emergency_number: str = None
