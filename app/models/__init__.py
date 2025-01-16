from sqlalchemy import (
    Column,
    Integer,
    Float,
    Date,
    JSON,
    ForeignKey,
    String,
    DateTime,
    func,
)
from sqlalchemy.orm import relationship, DeclarativeBase
from sqlalchemy.dialects.postgresql import UUID
from uuid import uuid4


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, unique=True)
    email = Column(String(256), nullable=False, unique=True)
    password = Column(String(256))
    role = Column(String, nullable=False, default="user")
    name = Column(String)
    gender = Column(String)
    img_src = Column(String)
    address = Column(String)
    created_by = Column(String, nullable=False, default="self_attempted")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class Patient(User):
    __tablename__ = "patients"
    id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    profession = Column(String)
    date_of_birth = Column(String)
    contact_number = Column(String)
    emergency_number = Column(String)

    health_records = relationship("HealthRecord", back_populates="patient")
    appointments = relationship("Appointment", back_populates="patient")
    medication = relationship("Medication", back_populates="patient")


class Doctor(User):
    __tablename__ = "doctors"

    id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    description = Column(String, nullable=False)
    hospital_id = Column(
        UUID(as_uuid=True),
        ForeignKey("hospitals.id", ondelete="CASCADE"),
        nullable=False,
    )
    available_times = Column(String, nullable=False)
    experience = Column(Integer, nullable=False)
    emails = Column(JSON, nullable=False)
    contact_numbers = Column(JSON, nullable=False)

    hospital = relationship("Hospital", back_populates="doctors")
    appointments = relationship("Appointment", back_populates="doctor")
    medications = relationship("Medication", back_populates="doctor")


class HealthRecord(Base):
    __tablename__ = "health_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, unique=True)
    patient_id = Column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
    )
    weight = Column(Float)
    height = Column(Float)
    blood_group = Column(String)
    smoking_status = Column(String)
    physical_activity = Column(String)
    previous_diabetes_records = Column(JSON)
    blood_pressure_records = Column(JSON)
    blood_glucose_records = Column(JSON)
    body_temperature = Column(Float)
    blood_oxygen = Column(Float)
    bmi = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="health_records")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, unique=True)

    patient_id = Column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
    )
    doctor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="CASCADE"),
        nullable=False,
    )

    test_name = Column(String)
    referred_by = Column(JSON)
    purpose_of_visit = Column(JSON)
    patient_note = Column(String)
    doctor_note = Column(String)
    appointment_date = Column(Date, nullable=False)
    appointment_time = Column(String, nullable=False)
    mode = Column(String, nullable=False, default="in-person")
    type = Column(String, nullable=False, default="consultation")
    status = Column(String, nullable=False, default="upcoming")
    serial_number = Column(Integer, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("Doctor", back_populates="appointments")
    medication = relationship("Medication", back_populates="appointment")


class Medication(Base):
    __tablename__ = "medications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, unique=True)

    # relationships w other entities
    patient_id = Column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
    )
    doctor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="CASCADE"),
        nullable=True,
    )
    appointment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="CASCADE"),
        nullable=True,
    )

    primary_goals = Column(String, nullable=False)
    medications = Column(JSON)
    dietary = Column(JSON)
    nutritions = Column(JSON)
    energy_goal = Column(Float)
    bmi_goal = Column(Float)
    hydration = Column(String)
    sleep = Column(String)
    exercises = Column(JSON)
    monitoring = Column(JSON)
    expiry = Column(Float)
    allergies = Column(JSON)
    recommended_ingredients = Column(JSON)
    preferred_cuisine = Column(String)
    generated_by = Column(String, nullable=False, default="system")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    # relationships w other entities
    doctor = relationship("Doctor", back_populates="medications")
    patient = relationship("Patient", back_populates="medication")
    appointment = relationship("Appointment", back_populates="medication")


class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, unique=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    city = Column(String, nullable=False)
    img_src = Column(String, nullable=False)
    description = Column(String, nullable=False)
    emails = Column(JSON, nullable=False)
    contact_numbers = Column(JSON, nullable=False)
    geometry = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    doctors = relationship("Doctor", back_populates="hospital")


class Meal(Base):
    __tablename__ = "meals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, unique=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    description = Column(String(256), nullable=False)
    ingredients = Column(JSON, nullable=False)
    time = Column(String, nullable=False)
    calories = Column(Float, nullable=False)
    protein = Column(Float, nullable=False)
    fat = Column(Float, nullable=False)
    carbs = Column(Float, nullable=False)
    blog = Column(String, nullable=False)
    img_src = Column(String, nullable=False)
    cooking_type = Column(String)
    cuisine = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
