import type { HealthRecord, Medication } from "@prisma/client";
import { uuidToBase64 } from "../core/security.js";
import { calculateAge } from "../core/utils.js";

export class DoctorSerialization {
  static profileInfo(data: Record<string, unknown>) {
    return {
      id: uuidToBase64(String(data.id)),
      hospital_id: uuidToBase64(String(data.hospitalId ?? data.hospital_id)),
      email: data.email,
      role: data.role,
      name: data.name,
      gender: data.gender,
      img_src: data.imgSrc ?? data.img_src,
      bg_src: data.bgSrc ?? data.bg_src ?? null,
      text_size: data.textSize ?? data.text_size ?? "medium",
      address: data.address,
      description: data.description,
      available_times: data.availableTimes ?? data.available_times,
      experience: data.experience,
      emails: data.emails,
      contact_numbers: data.contactNumbers ?? data.contact_numbers,
    };
  }

  static appointmentInfo(data: {
    id: string;
    patientId: string;
    doctorId: string;
    patient: { id: string; name: string | null };
    [key: string]: unknown;
  }) {
    const excluded = new Set(["id", "doctorId", "patientId", "patient"]);
    const rest = Object.fromEntries(
      Object.entries(data).filter(([key]) => !excluded.has(key)),
    );
    return {
      id: uuidToBase64(data.id),
      ...serializeKeys(rest),
      patient: {
        id: uuidToBase64(data.patient.id),
        name: data.patient.name,
      },
    };
  }

  static patientInfo(data: Record<string, unknown>) {
    const { id, ...rest } = data;
    return {
      id: uuidToBase64(String(id)),
      ...serializeKeys(rest),
    };
  }

  static mergedInfo(data: {
    id: string;
    doctorId: string;
    patientId: string;
    patient: {
      id: string;
      name: string | null;
      gender: string | null;
      imgSrc: string | null;
      address: string | null;
      dateOfBirth: string | null;
    };
    [key: string]: unknown;
  }) {
    const excluded = new Set(["id", "doctorId", "patientId", "patient"]);
    const rest = Object.fromEntries(
      Object.entries(data).filter(([key]) => !excluded.has(key)),
    );
    return {
      id: uuidToBase64(data.id),
      ...serializeKeys(rest),
      doctor_id: uuidToBase64(data.doctorId),
      patient: {
        id: uuidToBase64(data.patient.id),
        age: calculateAge(data.patient.dateOfBirth),
        name: data.patient.name,
        gender: data.patient.gender,
        img_src: data.patient.imgSrc,
        address: data.patient.address,
      },
    };
  }

  static healthInfo(healthResult: HealthRecord) {
    return {
      id: uuidToBase64(healthResult.id),
      weight: healthResult.weight,
      height: healthResult.height,
      blood_group: healthResult.bloodGroup,
      smoking_status: healthResult.smokingStatus,
      physical_activity: healthResult.physicalActivity,
      previous_diabetes_records: healthResult.previousDiabetesRecords,
      blood_pressure_records: healthResult.bloodPressureRecords,
      blood_glucose_records: healthResult.bloodGlucoseRecords,
      body_temperature: healthResult.bodyTemperature,
      blood_oxygen: healthResult.bloodOxygen,
      bmi: healthResult.bmi,
    };
  }

  static medicationInfo(data: Medication | null) {
    if (!data) return [];
    return {
      id: uuidToBase64(data.id),
      patient_id: uuidToBase64(data.patientId),
      doctor_id: data.doctorId ? uuidToBase64(data.doctorId) : null,
      appointment_id: data.appointmentId ? uuidToBase64(data.appointmentId) : null,
      primary_goals: data.primaryGoals,
      medications: data.medications,
      dietary: data.dietary,
      nutritions: data.nutritions,
      energy_goal: data.energyGoal,
      bmi_goal: data.bmiGoal,
      hydration: data.hydration,
      sleep: data.sleep,
      exercises: data.exercises,
      monitoring: data.monitoring,
      expiry: data.expiry,
      allergies: data.allergies,
      recommended_ingredients: data.recommendedIngredients,
      preferred_cuisine: data.preferredCuisine,
      generated_by: data.generatedBy,
    };
  }

  static patientAppointment(data: {
    id: string;
    patientId: string;
    doctorId: string;
    doctor: {
      id: string;
      name: string | null;
      hospital: { id: string; name: string; address: string };
    };
    [key: string]: unknown;
  }) {
    const excluded = new Set(["id", "patientId", "doctorId", "doctor"]);
    const rest = Object.fromEntries(
      Object.entries(data).filter(([key]) => !excluded.has(key)),
    );
    return {
      id: uuidToBase64(data.id),
      patient_id: uuidToBase64(data.patientId),
      doctor: {
        id: uuidToBase64(data.doctor.id),
        name: data.doctor.name,
      },
      hospital: {
        id: uuidToBase64(data.doctor.hospital.id),
        name: data.doctor.hospital.name,
        address: data.doctor.hospital.address,
      },
      ...serializeKeys(rest),
    };
  }
}

export class PatientSerialization {
  static suggestion(medication: Medication) {
    const expiryTime = new Date(medication.createdAt);
    expiryTime.setDate(expiryTime.getDate() + 30);
    const remainingDays =
      Math.floor((expiryTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) + 1;

    const data: Record<string, unknown> = {
      id: uuidToBase64(medication.id),
      patient_id: uuidToBase64(medication.patientId),
      expiry: remainingDays,
      primary_goals: medication.primaryGoals,
      medications: medication.medications,
      dietary: medication.dietary,
      nutritions: medication.nutritions,
      energy_goal: medication.energyGoal,
      bmi_goal: medication.bmiGoal,
      hydration: medication.hydration,
      sleep: medication.sleep,
      exercises: medication.exercises,
      monitoring: medication.monitoring,
      allergies: medication.allergies,
      recommended_ingredients: medication.recommendedIngredients,
      preferred_cuisine: medication.preferredCuisine,
      generated_by: medication.generatedBy,
    };

    if (medication.appointmentId) {
      data.appointment_id = uuidToBase64(medication.appointmentId);
    }
    if (medication.doctorId) {
      data.doctor_id = uuidToBase64(medication.doctorId);
    }

    return data;
  }
}

function serializeKeys(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[camelToSnake(key)] = value;
  }
  return result;
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
