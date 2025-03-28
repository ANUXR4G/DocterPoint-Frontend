from app.models import Doctor, HealthRecord, Medication
from app.core.security import uuid_to_base64
from app.core.utils import calculate_age
from datetime import timedelta, datetime, timezone


class DoctorSerialization:
    @staticmethod
    # Refactor doctors' profile informations (e.g, replace ids w base64 strings)
    def profile_info(data: Doctor):
        return {
            "id": uuid_to_base64(data.id),
            "hospital_id": uuid_to_base64(data.hospital_id),
            **{
                key: val
                for key, val in data.__dict__.items()
                if key not in {"id", "hospital_id"}  # Exclude 'id'
            },
        }

    # Refactor appointment information (e.g, replace ids w base64 strings)
    @staticmethod
    def appointment_info(data):
        return {
            "id": uuid_to_base64(data.id),
            **{
                key: val
                for key, val in data.__dict__.items()
                if key
                not in {
                    "id",
                    "doctor_id",
                    "patient_id",
                    "patient",
                }  # Exclude 'id', 'doctor_id', 'patient_id', 'patient'
            },
            "patient": {
                "id": uuid_to_base64(data.patient.id),
                "name": data.patient.name,
            },
        }

    # Refactor doctor information
    @staticmethod
    def patient_info(data):
        return {
            "id": uuid_to_base64(data.id),
            **{
                key: val
                for key, val in data.__dict__.items()
                if key != "id"  # Exclude 'id'
            },
        }

    @staticmethod
    def merged_info(data):
        age = calculate_age(data.patient.date_of_birth)
        updated_data = {
            "id": uuid_to_base64(data.id),
            **{
                key: val
                for key, val in data.__dict__.items()
                if key
                not in {
                    "id",
                    "doctor_id",
                    "patient_id",
                    "patient",
                    # "medication",
                }  # Exclude 'id', 'doctor_id', 'patient_id', 'patient', and 'medication'
            },
            "doctor_id": uuid_to_base64(data.doctor_id),
            "patient": {
                "id": uuid_to_base64(data.patient.id),
                "age": age,
                "name": data.patient.name,
                "gender": data.patient.gender,
                "img_src": data.patient.img_src,
                "address": data.patient.address,
            },
        }

        return updated_data

    @staticmethod
    def health_info(health_result: HealthRecord):
        return {
            "id": uuid_to_base64(health_result.id),
            **{
                key: val
                for key, val in health_result.__dict__.items()
                if key
                not in {
                    "id",
                    "patient_id",
                }  # Exclude 'id', and 'patient_id'
            },
        }

    @staticmethod
    def medication_info(data: Medication):
        return (
            {
                "id": uuid_to_base64(data.id),
                **{key: val for key, val in data.__dict__.items() if key != "id"},
            }
            if data
            else []
        )

    @staticmethod
    def patient_appointment(data):
        return {
            "id": uuid_to_base64(data.id),
            "patient_id": uuid_to_base64(data.patient_id),
            "doctor": {
                "id": uuid_to_base64(data.doctor.id),
                "name": data.doctor.name,
            },
            "hospital": {
                "id": uuid_to_base64(data.doctor.hospital.id),
                "name": data.doctor.hospital.name,
                "address": data.doctor.hospital.address,
            },
            **{
                key: val
                for key, val in data.__dict__.items()
                if key
                not in {
                    "id",
                    "patient_id",
                    "doctor_id",
                    "doctor",
                }  # Exclude 'id', 'doctor_id', 'patient_id'
            },
        }


class PatientSerialization:
    @staticmethod
    def suggestion(medication: Medication):
        expiry_time = medication.created_at + timedelta(days=30)
        remaining_days = (expiry_time - datetime.now(timezone.utc)).days + 1

        data = {
            "id": uuid_to_base64(medication.id),
            "patient_id": uuid_to_base64(medication.patient_id),
            "expiry": remaining_days,
        }

        # Add doctor_id only if it exists
        if medication.appointment_id:
            data["appointment_id"] = uuid_to_base64(medication.appointment_id)

        if medication.doctor_id:
            data["doctor_id"] = uuid_to_base64(medication.doctor_id)

        data.update(
            {
                key: val
                for key, val in medication.__dict__.items()
                if key
                not in {
                    "expiry",
                    "id",
                    "doctor_id",
                    "appointment_id",
                    "patient_id",
                    "created_at",
                }  # exclude 'expiry', 'id', 'doctor_id', and 'patient_id', 'appointment_id', 'created_at' and 'updated_at',
            }
        )

        return data
