from typing import List, Optional
from pydantic import BaseModel, EmailStr


class DoctorBase(BaseModel):
    def none_excluded(self):
        return {k: v for k, v in self.model_dump().items() if v is not None}

    def is_empty(self) -> bool:
        return all(value is None for value in self.model_dump().values())

    pass


class DoctorHospital(BaseModel):
    url: str
    name: str
    city: str
    address: str


class DoctorResponse(BaseModel):
    url: str
    name: str
    gender: str
    img_src: str
    address: str
    description: str
    available_times: str
    experience: int
    emails: List[str]
    contact_numbers: List[str]
    hospital: DoctorHospital


# admin doctor
class DoctorCreateAdmin(BaseModel):
    email: EmailStr
    password: str
    name: str
    gender: str
    img_src: str
    address: str
    description: str
    available_times: str
    experience: int
    emails: List[str] = None
    contact_numbers: List[str]


class DoctorUpdateAdmin(DoctorBase):
    email: EmailStr = None
    password: str = None
    name: str = None
    gender: str = None
    img_src: str = None
    address: str = None
    description: str = None
    available_times: str = None
    experience: int = None
    emails: List[str] = None
    contact_numbers: List[str] = None


class Exercises(BaseModel):
    name: str
    times: List[str]
    duration: str
    description: Optional[str] = None


class Medicines(BaseModel):
    name: str
    amount: int
    times: List[str]
    description: Optional[str] = None


class UpdateAppointment(DoctorBase):
    status: str
    medications: Optional[List[Medicines]] = None
    exercises: Optional[List[Exercises]] = None
    doctor_note: Optional[str] = None
    generated_by: str = "doctor"
