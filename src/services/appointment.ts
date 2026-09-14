import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { uuidToBase64, base64ToUuid } from "../core/security.js";
import { deleteCachedKeys, getCachedJson, setCachedJson } from "../db/redis.js";
import { ResponseHandler } from "../core/response.js";
import { isEmpty, noneExcluded } from "../core/utils.js";
import { socketManager } from "../core/socket.js";
import type { RedisClient, SessionUser } from "../types/index.js";
import { AppError } from "../core/response.js";

const statusPriority: Record<string, number> = {
  requested: 1,
  upcoming: 2,
  resheduled: 3,
  missed: 4,
  completed: 5,
  cancelled: 6,
};

function appointmentData(appointment: {
  id: string;
  serialNumber: number;
  mode: string;
  type: string;
  status: string;
  appointmentDate: Date;
  appointmentTime: string;
  purposeOfVisit: unknown;
  testName: string | null;
  referredBy: unknown;
  patientNote: string | null;
  doctorNote: string | null;
  doctor: {
    id: string;
    user: { name: string | null };
    hospital: { id: string; name: string; address: string };
  };
}) {
  return {
    id: uuidToBase64(appointment.id),
    serial_number: appointment.serialNumber,
    mode: appointment.mode,
    type: appointment.type,
    status: appointment.status,
    appointment_date: appointment.appointmentDate,
    appointment_time: appointment.appointmentTime,
    purpose_of_visit: appointment.purposeOfVisit,
    test_name: appointment.testName,
    referred_by: appointment.referredBy,
    doctor: {
      id: uuidToBase64(appointment.doctor.id),
      name: appointment.doctor.user.name,
    },
    hospital: {
      id: uuidToBase64(appointment.doctor.hospital.id),
      name: appointment.doctor.hospital.name,
      address: appointment.doctor.hospital.address,
    },
    patient_note: appointment.patientNote,
    doctor_note: appointment.doctorNote,
  };
}

const appointmentInclude = {
  doctor: {
    include: {
      user: { select: { name: true } },
      hospital: { select: { id: true, name: true, address: true } },
    },
  },
};

export class AppointmentService {
  static async newAppointment(
    appointment: Record<string, unknown>,
    sessionUser: SessionUser,
    redis: RedisClient,
  ) {
    const doctorId = base64ToUuid(String(appointment.doctor_id ?? appointment.doctorId));
    const requestRoomId = `${uuidToBase64(doctorId)}_RA`;

    const maxSerial = await prisma.appointment.aggregate({
      _max: { serialNumber: true },
    });

    const payload: Prisma.AppointmentUncheckedCreateInput = {
      patientId: sessionUser.id,
      doctorId,
      serialNumber: (maxSerial._max.serialNumber ?? 0) + 1,
      mode: String(appointment.mode),
      appointmentDate: new Date(String(appointment.appointment_date ?? appointment.appointmentDate)),
      appointmentTime: String(appointment.appointment_time ?? appointment.appointmentTime),
      type: String(appointment.type ?? "consultation"),
      status: String(appointment.status ?? "requested"),
      testName: (appointment.test_name ?? appointment.testName) as string | undefined,
      patientNote: (appointment.patient_note ?? appointment.patientNote) as string | undefined,
      doctorNote: (appointment.doctor_note ?? appointment.doctorNote) as string | undefined,
      purposeOfVisit: (appointment.purpose_of_visit ?? appointment.purposeOfVisit) as
        | Prisma.InputJsonValue
        | undefined,
      referredBy: (appointment.referred_by ?? appointment.referredBy) as
        | Prisma.InputJsonValue
        | undefined,
    };

    const created = await prisma.appointment.create({
      data: payload,
      include: appointmentInclude,
    });

    if (!created.doctor) {
      throw new AppError(400, "something went wrong while creating new appointment.");
    }

    const newAppointmentData = appointmentData(created);
    await socketManager.sendPrivateMsg(requestRoomId, newAppointmentData);

    const patientAppointmentsKey = `patients:appointments:${uuidToBase64(created.patientId)}`;
    await setCachedJson(
      `${patientAppointmentsKey}:${uuidToBase64(created.id)}`,
      newAppointmentData,
    );

    await deleteCachedKeys([
      `${patientAppointmentsKey}:page:*`,
      `${patientAppointmentsKey}:total`,
      `${patientAppointmentsKey}:upcoming`,
    ]);

    return newAppointmentData;
  }

  static async getAppointmentById(
    id: string,
    sessionUser: SessionUser,
    redis: RedisClient,
  ) {
    const redisKey = `patients:appointments:${uuidToBase64(sessionUser.id)}:${id}`;
    const cached = await getCachedJson<Record<string, unknown>>(redisKey);
    if (cached) return cached;

    const appointment = await prisma.appointment.findUnique({
      where: { id: base64ToUuid(id) },
      include: appointmentInclude,
    });

    if (!appointment || !appointment.doctor) {
      ResponseHandler.notFoundError("failed to retrieve appointment.");
    }

    const appointmentInfoData = appointmentData(appointment!);
    await setCachedJson(redisKey, appointmentInfoData);
    return appointmentInfoData;
  }

  static async getUpcomingAppointments(sessionUser: SessionUser, redis: RedisClient) {
    const upcomingKey = `patients:appointments:${uuidToBase64(sessionUser.id)}:upcoming`;
    const cached = await getCachedJson<unknown[]>(upcomingKey);
    if (cached) return cached;

    const appointments = await prisma.appointment.findMany({
      where: {
        patientId: sessionUser.id,
        status: { in: ["upcoming", "rescheduled"] },
      },
      include: appointmentInclude,
      orderBy: { appointmentDate: "asc" },
    });

    const upcomingAppointmentsData = appointments.map(appointmentData);
    await setCachedJson(upcomingKey, upcomingAppointmentsData);
    return upcomingAppointmentsData;
  }

  static async getAllAppointments(
    q: string | undefined,
    page: number,
    limit: number,
    patient: SessionUser,
    redis: RedisClient,
  ) {
    page = Math.max(1, page);
    const offset = (page - 1) * limit;
    const patientAppointmentsKey = `patients:appointments:${uuidToBase64(patient.id)}`;
    const redisKey = `${patientAppointmentsKey}:page:${page}`;
    const redisKeyTotal = `${patientAppointmentsKey}:total`;

    if (!q) {
      const cachedAppointments = await getCachedJson<unknown[]>(redisKey);
      const cachedTotal = await getCachedJson<number>(redisKeyTotal);
      if (cachedAppointments && cachedTotal !== null) {
        return { total: cachedTotal, appointments: cachedAppointments };
      }
    }

    const where: Record<string, unknown> = { patientId: patient.id };
    if (q) {
      where.OR = [
        { doctor: { user: { name: { contains: q, mode: "insensitive" } } } },
        { doctor: { hospital: { name: { contains: q, mode: "insensitive" } } } },
        { doctor: { hospital: { city: { contains: q, mode: "insensitive" } } } },
        { doctor: { hospital: { address: { contains: q, mode: "insensitive" } } } },
      ];
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

    const filteredAppointments = appointments
      .sort((a, b) => {
        const statusDiff =
          (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        return a.appointmentDate.getTime() - b.appointmentDate.getTime();
      })
      .map(appointmentData);

    if (!q) {
      await setCachedJson(redisKeyTotal, total);
      await setCachedJson(redisKey, filteredAppointments);
    }

    return { total, appointments: filteredAppointments };
  }

  static async updateAppointmentById(
    appointmentId: string,
    updatedData: Record<string, unknown>,
    redis: RedisClient,
  ) {
    const appointmentIdUuid = base64ToUuid(appointmentId);
    const existing = await prisma.appointment.findUnique({
      where: { id: appointmentIdUuid },
    });

    if (!existing) {
      ResponseHandler.notFoundError("failed to update, appointment not found.");
    }

    if (["completed", "missed", "cancelled"].includes(existing!.status)) {
      ResponseHandler.noPermission("updating this appointment is not allowed.");
    }

    const payload = noneExcluded(updatedData);
    if (isEmpty(payload)) {
      throw new AppError(400, "failed to update, no data was provided");
    }

    const data: Record<string, unknown> = { updatedAt: new Date() };
    const mapping: Record<string, string> = {
      appointment_date: "appointmentDate",
      appointment_time: "appointmentTime",
      test_name: "testName",
      patient_note: "patientNote",
      doctor_note: "doctorNote",
      purpose_of_visit: "purposeOfVisit",
      referred_by: "referredBy",
    };

    for (const [key, value] of Object.entries(payload)) {
      const mapped = mapping[key] ?? key;
      if (mapped === "appointmentDate") {
        data[mapped] = new Date(String(value));
      } else {
        data[mapped] = value;
      }
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentIdUuid },
      data,
      include: appointmentInclude,
    });

    const updatedAppointmentData = appointmentData(updated);
    const patientAppointmentsKey = `patients:appointments:${uuidToBase64(updated.patientId)}`;
    await setCachedJson(
      `${patientAppointmentsKey}:${appointmentId}`,
      updatedAppointmentData,
    );

    const doctorId = uuidToBase64(updated.doctorId);
    await deleteCachedKeys([
      `users:doctor:${doctorId}:appointments:page:*`,
      `${patientAppointmentsKey}:page:*`,
      `${patientAppointmentsKey}:total`,
      `${patientAppointmentsKey}:upcoming`,
    ]);

    return updatedAppointmentData;
  }
}
