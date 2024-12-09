from typing import List
from pydantic import BaseModel


class HealthRecordBase(BaseModel):
    def none_excluded(self):
        return {k: v for k, v in self.model_dump().items() if v is not None}

    def is_empty(self) -> bool:
        return all(value is None for value in self.model_dump().values())

    pass


class HealthRecordValues(BaseModel):
    value: int
    time: str


class BloodPressureBase(BaseModel):
    type: str
    data: List[HealthRecordValues]


class HealthRecordResponse(BaseModel):
    url: str | None = None
    weight: float | None = None
    height: float | None = None
    blood_group: str | None = None
    smoking_status: str | None = None
    physical_activity: str | None = None
    previous_diabetes_records: List[str] | None = None
    blood_pressure_records: List[BloodPressureBase] | None = None
    blood_glucose_records: List[HealthRecordValues] | None = None
    body_temperature: float | None = None
    blood_oxygen: str | None = None
    bmi: float | None = None


class HealthRecordUpdate(HealthRecordBase):
    weight: float = None
    height: float = None
    blood_group: str = None
    smoking_status: str = None
    physical_activity: str = None
    previous_diabetes_records: List[str] = None
    body_temperature: float = None
    blood_oxygen: float = None
    blood_pressure_records: List[BloodPressureBase] = None
    blood_glucose_records: List[HealthRecordValues] = None


class BloodPressure(HealthRecordBase):
    blood_pressure_records: List[BloodPressureBase]


class BloodGlucose(HealthRecordBase):
    blood_glucose_records: List[HealthRecordValues]


# admin
class HealthRecordUpdateAdmin(HealthRecordBase):
    weight: float = None
    height: float = None
    blood_group: str = None
    smoking_status: str = None
    physical_activity: str = None
    previous_diabetes_records: List[str] = None
    body_temperature: float = None
    blood_oxygen: str = None
    blood_pressure_records: List[BloodPressureBase] = None
    blood_glucose_records: List[HealthRecordValues] = None
