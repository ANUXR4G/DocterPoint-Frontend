from sqlalchemy import Column, Integer, Float, JSON, ForeignKey, String, DateTime, func
from sqlalchemy.orm import relationship, DeclarativeBase
from sqlalchemy.dialects.postgresql import UUID, ARRAY
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
