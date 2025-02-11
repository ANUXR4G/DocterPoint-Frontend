from pydantic import BaseModel
from uuid import UUID
from datetime import date


class AppintmentBase(BaseModel):
    def none_excluded(self):
        return {k: v for k, v in self.model_dump().items() if v is not None}

    def is_empty(self) -> bool:
        return all(value is None for value in self.model_dump().values())

    class Config:
        from_attributes = True

    pass


class DoctorDetails(BaseModel):
    id: str
    name: str


class AppointmentCreate(AppintmentBase):
    mode: str
    doctor_id: str
    appointment_date: date
    appointment_time: str
    type: str = "consultation"
    status: str = "requested"
    test_name: str = None
    patient_note: str = None
    doctor_note: str = None
    purpose_of_visit: list[str] = None
    referred_by: DoctorDetails = None


class AppointmentUpdate(AppintmentBase):
    mode: str | None = None
    appointment_date: date | None = None
    appointment_time: str | None = None
    type: str | None = None
    status: str | None = None
    test_name: str = None
    patient_note: str = None
    purpose_of_visit: list[str] = None
