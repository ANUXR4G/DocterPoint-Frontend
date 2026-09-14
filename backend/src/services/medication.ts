import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { uuidToBase64, base64ToUuid } from "../core/security.js";
import { getCachedJson, setCachedJson, deleteCachedKeys } from "../db/redis.js";
import { ResponseHandler } from "../core/response.js";
import { getAgeGroup, isEmpty, noneExcluded } from "../core/utils.js";
import { dummySuggestions, exercises } from "../core/dummy.js";
import { PatientSerialization } from "./serialization.js";
import type { RedisClient, SessionUser } from "../types/index.js";
import { AppError } from "../core/response.js";

export class MedicationService {
  static async generateBySystem(
    payload: { age: number },
    sessionUser: SessionUser,
    redis: RedisClient,
  ) {
    const age = getAgeGroup(payload.age);
    const suggestionData = dummySuggestions[age] ?? dummySuggestions["25-34"];

    const medication = await prisma.medication.create({
      data: {
        primaryGoals: "General Purpose",
        patientId: sessionUser.id,
        energyGoal: suggestionData.energy_goal as number,
        hydration: suggestionData.hydration as string,
        sleep: suggestionData.sleep as string,
        dietary: suggestionData.dietary as Prisma.InputJsonValue,
        nutritions: suggestionData.nutritions as Prisma.InputJsonValue,
        exercises,
        expiry: 30,
      },
    });

    const medicationDetails = PatientSerialization.suggestion(medication);
    const redisKey = `patients:medications:${uuidToBase64(sessionUser.id)}`;
    await setCachedJson(redisKey, medicationDetails);
    return medicationDetails;
  }

  static async getPatientMedications(sessionUser: SessionUser, redis: RedisClient) {
    const patientId = uuidToBase64(sessionUser.id);
    const redisKey = `patients:medications:${patientId}`;

    const cached = await getCachedJson<unknown>(redisKey);
    if (cached) return cached;

    const medication = await prisma.medication.findFirst({
      where: {
        patientId: sessionUser.id,
        OR: [{ medications: { not: Prisma.DbNull } }, { exercises: { not: Prisma.DbNull } }],
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!medication) return [];

    const medicationDetails = PatientSerialization.suggestion(medication);
    await setCachedJson(redisKey, medicationDetails);
    return medicationDetails;
  }

  static async appointmentMedicationById(appointmentId: string, redis: RedisClient) {
    const redisKey = `patients:appointments:${appointmentId}:prescription`;
    const cached = await getCachedJson<unknown>(redisKey);
    if (cached) return cached;

    const medication = await prisma.medication.findFirst({
      where: { appointmentId: base64ToUuid(appointmentId) },
    });

    if (!medication) return [];

    const appointmentMedicationDetails = PatientSerialization.suggestion(medication);
    await setCachedJson(redisKey, appointmentMedicationDetails);
    return appointmentMedicationDetails;
  }

  static async updatePatientMedications(
    payload: Record<string, unknown>,
    sessionUser: SessionUser,
    patientId: string | undefined,
    redis: RedisClient,
  ) {
    const decodedPatientId = patientId
      ? base64ToUuid(patientId)
      : sessionUser.id;

    const redisKey = `patients:medications:${patientId ?? uuidToBase64(sessionUser.id)}`;

    const medication = await prisma.medication.findFirst({
      where: { patientId: decodedPatientId },
      orderBy: { updatedAt: "desc" },
    });

    if (!medication) {
      ResponseHandler.notFoundError("patient medication record not found.");
    }

    if (isEmpty(payload)) {
      throw new AppError(400, "no field was provided while updating medications.");
    }

    const updatedPayload = mapMedicationPayload(noneExcluded(payload));
    updatedPayload.updatedAt = new Date();

    if (payload.appointment_id || payload.appointmentId) {
      updatedPayload.appointmentId = base64ToUuid(
        String(payload.appointment_id ?? payload.appointmentId),
      );
    }

    const updated = await prisma.medication.update({
      where: { id: medication!.id },
      data: updatedPayload,
    });

    const medicationRecord = PatientSerialization.suggestion(updated);
    await setCachedJson(redisKey, medicationRecord);
    return medicationRecord;
  }

  static async deletePatientMedications(
    sessionUser: SessionUser,
    id: string,
    redis: RedisClient,
  ) {
    const patientId = uuidToBase64(sessionUser.id);
    const appointmentUuid = base64ToUuid(id);

    const medication = await prisma.medication.findFirst({
      where: { appointmentId: appointmentUuid },
    });

    if (!medication) {
      ResponseHandler.notFoundError(`medication record #${id} not found`);
    }

    await prisma.medication.delete({ where: { id: medication!.id } });

    await deleteCachedKeys([
      `patients:medications:${patientId}`,
      `patients:appointments:${patientId}:upcoming`,
    ]);

    return { message: `Successfuly deleted medication record #${id}` };
  }
}

function mapMedicationPayload(data: Record<string, unknown>) {
  const mapping: Record<string, string> = {
    primary_goals: "primaryGoals",
    energy_goal: "energyGoal",
    bmi_goal: "bmiGoal",
    recommended_ingredients: "recommendedIngredients",
    preferred_cuisine: "preferredCuisine",
    generated_by: "generatedBy",
    doctor_id: "doctorId",
  };

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    payload[mapping[key] ?? key] = value;
  }
  return payload;
}
