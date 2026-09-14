import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { uuidToBase64, base64ToUuid } from "../../core/security.js";
import { deleteCachedKeys, deleteCachedKey, getCachedJson, setCachedJson } from "../../db/redis.js";
import {
  calculateAge,
  Custom,
  getAgeGroup,
  statusPriorityMap,
} from "../../core/utils.js";
import { dummySuggestions } from "../../core/dummy.js";
import { DoctorSerialization } from "../serialization.js";
import type { RedisClient, SessionUser } from "../../types/index.js";
import { ResponseHandler } from "../../core/response.js";

const appointmentInclude = {
  patient: {
    include: { user: { select: { name: true } } },
  },
};

export class AppointmentService {
  static async getRequests(sessionUser: SessionUser) {
    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId: sessionUser.id,
        status: "requested",
      },
      include: appointmentInclude,
      orderBy: { appointmentDate: "desc" },
    });

    return appointments.map((info) =>
      DoctorSerialization.appointmentInfo({
        ...info,
        patient: { id: info.patientId, name: info.patient.user.name },
      }),
    );
  }

  static async getAppointments(
    sessionUser: SessionUser,
    redis: RedisClient,
    status: number,
    date?: string,
    q?: string,
    page = 1,
    limit = 10,
  ) {
    const doctorId = uuidToBase64(sessionUser.id);
    const redisKey = `users:doctor:${doctorId}:appointments:page:${page}`;
    const redisKeyTotal = `users:doctor:${doctorId}:appointments:total`;
    const cachedDataAllowed = date !== "old" && status === 1 && !q;

    if (cachedDataAllowed) {
      const cachedAppointments = await getCachedJson<unknown[]>(redisKey);
      const cachedTotal = await getCachedJson<number>(redisKeyTotal);
      if (cachedAppointments && cachedTotal !== null) {
        return { total: cachedTotal, appointments: cachedAppointments };
      }
    }

    page = Math.max(1, page);
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      doctorId: sessionUser.id,
      status: { not: "requested" },
    };

    if (q) {
      where.patient = { user: { name: { contains: q, mode: "insensitive" } } };
    }

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        skip: offset,
        take: limit,
      }),
    ]);

    const statusPriority = statusPriorityMap[status - 1] ?? statusPriorityMap[0];

    const sorted = appointments.sort((a, b) => {
      const statusDiff =
        (statusPriority[a.status as keyof typeof statusPriority] ?? 99) -
        (statusPriority[b.status as keyof typeof statusPriority] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      if (date === "old") {
        return a.appointmentDate.getTime() - b.appointmentDate.getTime();
      }
      return b.appointmentDate.getTime() - a.appointmentDate.getTime();
    });

    const result = sorted.map((info) =>
      DoctorSerialization.appointmentInfo({
        ...info,
        patient: { id: info.patientId, name: info.patient.user.name },
      }),
    );

    if (cachedDataAllowed) {
      await setCachedJson(redisKey, result);
      await setCachedJson(redisKeyTotal, total);
    }

    return { total, appointments: result };
  }

  static async getInfo(
    appointmentId: string,
    doctor: SessionUser,
    redis: RedisClient,
  ) {
    const appointmentUuid = base64ToUuid(appointmentId);

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentUuid },
      include: {
        patient: {
          include: {
            user: {
              select: {
                name: true,
                gender: true,
                imgSrc: true,
                address: true,
              },
            },
          },
        },
      },
    });

    if (!appointment) {
      ResponseHandler.notFoundError(`Appointment record #${appointmentUuid} not found`);
    }

    if (doctor.id !== appointment!.doctorId) {
      ResponseHandler.noPermission("You are not allowed to view this resource");
    }

    const appointmentData = DoctorSerialization.mergedInfo({
      ...appointment!,
      patient: {
        id: appointment!.patientId,
        name: appointment!.patient.user.name,
        gender: appointment!.patient.user.gender,
        imgSrc: appointment!.patient.user.imgSrc,
        address: appointment!.patient.user.address,
        dateOfBirth: appointment!.patient.dateOfBirth,
      },
    });

    if (["upcoming", "ongoing", "reshedule"].includes(appointment!.status)) {
      const [healthResult, medicationResult] = await Promise.all([
        prisma.healthRecord.findFirst({
          where: { patientId: appointment!.patientId },
        }),
        prisma.medication.findFirst({
          where: {
            patientId: appointment!.patientId,
            OR: [
              { medications: { not: Prisma.DbNull } },
              { exercises: { not: Prisma.DbNull } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          select: {
            medications: true,
            exercises: true,
            allergies: true,
          },
        }),
      ]);

      return {
        ...appointmentData,
        health: healthResult
          ? DoctorSerialization.healthInfo(healthResult)
          : [],
        medication: medicationResult
          ? DoctorSerialization.medicationInfo(medicationResult as never)
          : [],
      };
    }

    const medicationResult = await prisma.medication.findFirst({
      where: { appointmentId: appointment!.id },
    });

    return {
      ...appointmentData,
      health: [],
      medication: DoctorSerialization.medicationInfo(medicationResult),
    };
  }

  static async updateInfo(
    id: string,
    doctor: SessionUser,
    payload: Record<string, unknown>,
    redis: RedisClient,
  ) {
    const updatedData = {
      ...mapAppointmentUpdate(payload),
      updatedAt: new Date(),
    };

    const appointmentUuid = base64ToUuid(id);
    const doctorId = uuidToBase64(doctor.id);

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentUuid },
      include: {
        patient: true,
      },
    });

    if (!appointment) {
      ResponseHandler.notFoundError(`${id} Appointment # not found`);
    }

    const patientId = uuidToBase64(appointment!.patientId);

    await prisma.appointment.update({
      where: { id: appointmentUuid },
      data: updatedData,
    });

    let medicationResult = await prisma.medication.findFirst({
      where: {
        patientId: appointment!.patientId,
        appointmentId: appointment!.id,
      },
    });

    if (medicationResult) {
      if (payload.status === "cancelled") {
        await prisma.medication.delete({ where: { id: medicationResult.id } });
        await updatingInfoRedisKeys(redis, doctorId, patientId);
        await deleteCachedKey(`patients:medications:${patientId}`);
        return { message: "Successfully deleted medication record" };
      }

      const medicationUpdate = pickMedicationFields(updatedData);
      medicationResult = await prisma.medication.update({
        where: { id: medicationResult.id },
        data: medicationUpdate,
      });
    } else if (payload.status !== "declined") {
      const newMedicationData = pickMedicationFields(updatedData);
      const age = calculateAge(appointment!.patient.dateOfBirth);
      const ageGroup = getAgeGroup(age);
      const suggestionData = dummySuggestions[ageGroup] ?? dummySuggestions["25-34"];
      const purpose = appointment!.purposeOfVisit as string[] | null;

      medicationResult = await prisma.medication.create({
        data: {
          ...newMedicationData,
          energyGoal: suggestionData.energy_goal as number,
          hydration: suggestionData.hydration as string,
          sleep: suggestionData.sleep as string,
          dietary: suggestionData.dietary as Prisma.InputJsonValue,
          nutritions: suggestionData.nutritions as Prisma.InputJsonValue,
          expiry: 30,
          appointmentId: appointment!.id,
          doctorId: appointment!.doctorId,
          patientId: appointment!.patientId,
          primaryGoals: purpose
            ? Custom.convertListToStr(purpose)
            : "General Purpose",
        },
      });
    }

    await updatingInfoRedisKeys(redis, doctorId, patientId);

    const refreshedAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentUuid },
      include: appointmentInclude,
    });

    const appointmentData = DoctorSerialization.appointmentInfo({
      ...refreshedAppointment!,
      patient: {
        id: refreshedAppointment!.patientId,
        name: refreshedAppointment!.patient.user.name,
      },
    });

    return {
      ...appointmentData,
      medication: medicationResult ?? [],
    };
  }

  static async getAppointmentsToday(doctorId: string, sessionUser: SessionUser) {
    const doctorUuid = base64ToUuid(doctorId);

    if (sessionUser.id !== doctorUuid) {
      ResponseHandler.noPermission("you don't have permission to view this resource");
    }

    const today = new Date();
    const dayStart = new Date(today);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(today);
    dayEnd.setHours(23, 59, 59, 999);

    return prisma.appointment.count({
      where: {
        doctorId: sessionUser.id,
        status: { notIn: ["requested", "declined", "cancelled"] },
        appointmentDate: { gte: dayStart, lte: dayEnd },
      },
    });
  }
}

async function updatingInfoRedisKeys(
  redis: RedisClient,
  doctorId: string,
  patientId: string,
) {
  await deleteCachedKeys([
    `users:doctor:${doctorId}:appointments:page:*`,
    `users:doctor:${doctorId}:appointments:total`,
    `patients:appointments:${patientId}:page:*`,
    `patients:appointments:${patientId}:total`,
    `patients:appointments:${patientId}:upcoming`,
    `patients:medications:${patientId}`,
  ]);
}

function mapAppointmentUpdate(payload: Record<string, unknown>) {
  const mapping: Record<string, string> = {
    doctor_note: "doctorNote",
    generated_by: "generatedBy",
  };
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    data[mapping[key] ?? key] = value;
  }
  return data;
}

function pickMedicationFields(data: Record<string, unknown>) {
  const allowed = new Set([
    "medications",
    "exercises",
    "doctorNote",
    "generatedBy",
    "status",
    "updatedAt",
  ]);
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => allowed.has(key)),
  );
}
