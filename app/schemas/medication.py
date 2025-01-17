from pydantic import BaseModel
from typing import List, Optional


class MedicationBase(BaseModel):
    def none_excluded(self):
        return {k: v for k, v in self.model_dump().items() if v is not None}

    def is_empty(self) -> bool:
        return all(value is None for value in self.model_dump().values())

    pass


class Medicines(BaseModel):
    name: str
    amount: int
    times: List[str]
    description: str | None = None


class Dietary(BaseModel):
    time: str
    energy: float


class Nutritions(BaseModel):
    name: str
    amount: float


class Exercises(BaseModel):
    name: str
    times: List[str]
    duration: str
    description: str | None = None


class Monitoring(BaseModel):
    name: str
    times: str


class CreateMedication(MedicationBase):
    primary_goals: str
    energy_goal: float
    hydration: str
    sleep: str
    doctor_id: Optional[str] = None
    appointment_id: Optional[str] = None
    medications: Optional[List[Medicines]] = None
    dietary: List[Dietary] = None
    nutritions: List[Nutritions] = None
    bmi_goal: float = None
    exercises: Optional[List[Exercises]] = None
    monitoring: Optional[List[Monitoring]] = None
    expiry: int = 30
    allergies: List[str] = None
    recommended_ingredients: List[str] = None
    preferred_cuisine: str = None


class UpdateMedication(MedicationBase):
    doctor_id: Optional[str] = None
    appointment_id: Optional[str] = None
    primary_goals: str = None
    medications: Optional[List[Medicines]] = None
    dietary: List[Dietary] = None
    nutritions: List[Nutritions] = None
    energy_goal: float = None
    bmi_goal: float = None
    hydration: str = None
    sleep: str = None
    exercises: Optional[List[Exercises]] = None
    monitoring: Optional[List[Monitoring]] = None
    expiry: int = None
    allergies: List[str] = None
    recommended_ingredients: List[str] = None
    preferred_cuisine: str = None


class GenerateMedication(BaseModel):
    age: int


class DietaryPreferences(BaseModel):
    restrictions: list[str] = []
    allergies: list[str] = []
    preferences: list[str] = []


class HealthMetrics(BaseModel):
    weight: float
    height: float
    age: int
    activity_level: str
    health_conditions: list[str] = []


class GenerateMedicationAi(MedicationBase):
    dietary_preferences: DietaryPreferences
    health_metrics: HealthMetrics
    goal: str
    meal_count: int
