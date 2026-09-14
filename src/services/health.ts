import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { uuidToBase64, base64ToUuid } from "../core/security.js";
import { getCachedJson, setCachedJson } from "../db/redis.js";
import { ResponseHandler } from "../core/response.js";
import { isEmpty, noneExcluded } from "../core/utils.js";
import { socketManager } from "../core/socket.js";
import type { RedisClient, SessionUser } from "../types/index.js";
import { AppError } from "../core/response.js";

function healthRecordData(info: {
  id: string;
  weight: number | null;
  height: number | null;
  bloodGroup: string | null;
  smokingStatus: string | null;
  physicalActivity: string | null;
  previousDiabetesRecords: unknown;
  bloodPressureRecords: unknown;
  bloodGlucoseRecords: unknown;
  bodyTemperature: number | null;
  bloodOxygen: number | null;
  bmi: number | null;
}) {
  return {
    id: uuidToBase64(info.id),
    weight: info.weight,
    height: info.height,
    blood_group: info.bloodGroup,
    smoking_status: info.smokingStatus,
    physical_activity: info.physicalActivity,
    previous_diabetes_records: info.previousDiabetesRecords,
    blood_pressure_records: info.bloodPressureRecords,
    blood_glucose_records: info.bloodGlucoseRecords,
    body_temperature: info.bodyTemperature,
    blood_oxygen: info.bloodOxygen,
    bmi: info.bmi,
  };
}

function computeBmi(
  weight: number,
  height: number,
): number {
  const heightMtr = height * 0.3048;
  return Math.round((weight / (heightMtr ** 2)) * 100) / 100;
}

export class HealthMonitorings {
  static async getHealthRecordInfo(sessionUser: SessionUser, redis: RedisClient) {
    const patientId = uuidToBase64(sessionUser.id);
    const redisKey = `patients:monitorings:${patientId}`;

    const cached = await getCachedJson<unknown>(redisKey);
    if (cached) return cached;

    const record = await prisma.healthRecord.findFirst({
      where: { patientId: sessionUser.id },
    });

    if (!record) return [];

    const healthRecordInfo = healthRecordData(record);
    await setCachedJson(redisKey, healthRecordInfo);
    return healthRecordInfo;
  }

  static async newHealthRecord(
    newData: Record<string, unknown>,
    sessionUser: SessionUser,
    redis: RedisClient,
  ) {
    if (isEmpty(newData)) {
      throw new AppError(400, "no field was provided while creating health record.");
    }

    const payload = mapHealthPayload(newData);
    payload.patientId = sessionUser.id;

    if (payload.weight && payload.height) {
      payload.bmi = computeBmi(payload.weight as number, payload.height as number);
    }

    const record = await prisma.healthRecord.create({
      data: payload as Prisma.HealthRecordUncheckedCreateInput,
    });
    const healthRecordInfo = healthRecordData(record);

    const patientId = uuidToBase64(sessionUser.id);
    const redisKey = `patients:monitorings:${patientId}`;
    const healthRecordJson = JSON.stringify(healthRecordInfo);
    await setCachedJson(redisKey, healthRecordInfo);

    await socketManager.broadcastToRoom(`${patientId}_MONITORING`, healthRecordJson);
    return healthRecordInfo;
  }

  static async updateHealthRecordById(
    updatedData: Record<string, unknown>,
    recordId: string,
    sessionUser: SessionUser,
    redis: RedisClient,
  ) {
    const healthRecordId = base64ToUuid(recordId);
    const record = await prisma.healthRecord.findUnique({
      where: { id: healthRecordId },
    });

    if (!record) {
      ResponseHandler.notFoundError("patient health record not found.");
    }

    if (isEmpty(updatedData)) {
      throw new AppError(400, "no field was provided while updating health record.");
    }

    const payload = mapHealthPayload(noneExcluded(updatedData));
    payload.updatedAt = new Date();

    const weight = (payload.weight as number | undefined) ?? record!.weight;
    const height = (payload.height as number | undefined) ?? record!.height;

    if (payload.height && payload.weight) {
      payload.bmi = computeBmi(payload.weight as number, payload.height as number);
    } else if (record!.height && payload.weight) {
      payload.bmi = computeBmi(payload.weight as number, record!.height);
    } else if (record!.weight && payload.height) {
      payload.bmi = computeBmi(record!.weight, payload.height as number);
    }

    const updated = await prisma.healthRecord.update({
      where: { id: healthRecordId },
      data: payload,
    });

    const healthRecordInfo = healthRecordData(updated);
    const patientId = uuidToBase64(sessionUser.id);
    const redisKey = `patients:monitorings:${patientId}`;
    const healthRecordJson = JSON.stringify(healthRecordInfo);
    await setCachedJson(redisKey, healthRecordInfo);

    await socketManager.broadcastToRoom(`${patientId}_MONITORING`, healthRecordJson);
    return healthRecordInfo;
  }
}

function mapHealthPayload(data: Record<string, unknown>) {
  const mapping: Record<string, string> = {
    blood_group: "bloodGroup",
    smoking_status: "smokingStatus",
    physical_activity: "physicalActivity",
    previous_diabetes_records: "previousDiabetesRecords",
    blood_pressure_records: "bloodPressureRecords",
    blood_glucose_records: "bloodGlucoseRecords",
    body_temperature: "bodyTemperature",
    blood_oxygen: "bloodOxygen",
  };

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    payload[mapping[key] ?? key] = value;
  }
  return payload;
}
