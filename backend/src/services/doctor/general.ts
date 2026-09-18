import { prisma } from "../../db/prisma.js";
import { uuidToBase64, base64ToUuid } from "../../core/security.js";
import { getCachedJson, setCachedJson } from "../../db/redis.js";
import { AppError, ResponseHandler } from "../../core/response.js";
import type { RedisClient, SessionUser } from "../../types/index.js";
import { DoctorSerialization } from "../serialization.js";
import { AuthService } from "../auth.js";

export class DoctorService {
  static async ensureDoctorRecord(userId: string, email: string) {
    const existing = await prisma.doctor.findUnique({
      where: { id: userId },
      include: { user: true },
    });
    if (existing) return existing;

    // JWT fast-path can accept a token after reseed/delete; never create a
    // doctor row for a missing user (FK doctors_id_fkey → users.id).
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(
        401,
        "Session is invalid or expired. Please sign in again.",
      );
    }

    const hospital = await AuthService.ensureIndependentHospital();
    try {
      await prisma.doctor.create({
        data: {
          id: userId,
          description: "Practice doctor — complete your profile.",
          hospitalId: hospital.id,
          availableTimes: "Mon–Fri 09:00–17:00",
          experience: 0,
          emails: [email || user.email],
          contactNumbers: user.phone ? [user.phone] : [],
        },
      });
    } catch (error) {
      // Concurrent ensure — another request created the row first.
      const race = await prisma.doctor.findUnique({
        where: { id: userId },
        include: { user: true },
      });
      if (race) return race;
      throw error;
    }

    return prisma.doctor.findUniqueOrThrow({
      where: { id: userId },
      include: { user: true },
    });
  }

  static async getInfo(sessionUser: SessionUser, redis: RedisClient) {
    const doctorId = uuidToBase64(sessionUser.id);
    const redisKey = `users:doctor:${doctorId}:info`;

    const cached = await getCachedJson<Record<string, unknown>>(redisKey);
    if (cached) return cached;

    let doctor = await prisma.doctor.findUnique({
      where: { id: sessionUser.id },
      include: { user: true },
    });

    if (!doctor) {
      doctor = await DoctorService.ensureDoctorRecord(
        sessionUser.id,
        sessionUser.email,
      );
    }

    const profileInfo = DoctorSerialization.profileInfo({
      id: doctor.id,
      hospitalId: doctor.hospitalId,
      email: doctor.user.email,
      role: doctor.user.role,
      name: doctor.user.name,
      gender: doctor.user.gender,
      imgSrc: doctor.user.imgSrc,
      bgSrc: doctor.user.bgSrc,
      textSize: doctor.user.textSize,
      address: doctor.user.address,
      description: doctor.description,
      availableTimes: doctor.availableTimes,
      experience: doctor.experience,
      emails: doctor.emails,
      contactNumbers: doctor.contactNumbers,
    });

    await setCachedJson(redisKey, profileInfo);
    return profileInfo;
  }

  static async getAnalytics(
    doctorId: string,
    sessionUser: SessionUser,
    periodType: string,
  ) {
    const allowedStatus = ["requested", "declined", "cancelled", "upcoming"];
    const normalized = periodType === "monthly" ? "month" : periodType;
    const allowed = ["day", "week", "month", "year", "yoy"];
    if (!allowed.includes(normalized)) {
      ResponseHandler.noPermission("Invalid param value.");
    }

    if (sessionUser.id !== base64ToUuid(doctorId)) {
      ResponseHandler.noPermission("Permission not granted.");
    }

    type Bucket = {
      label: string;
      start: Date;
      end: Date;
      prevStart?: Date;
      prevEnd?: Date;
    };

    const today = new Date();
    const currentYear = today.getFullYear();

    let buckets: Bucket[] = [];

    if (normalized === "day") {
      const dayStart = new Date(today);
      dayStart.setHours(0, 0, 0, 0);
      buckets = Array.from({ length: 24 }, (_, h) => {
        const start = new Date(dayStart);
        start.setHours(h, 0, 0, 0);
        const end = new Date(dayStart);
        end.setHours(h + 1, 0, 0, 0);
        end.setMilliseconds(-1);
        return { label: `${String(h).padStart(2, "0")}:00`, start, end };
      });
    } else if (normalized === "week") {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - ((today.getDay() + 7) % 7));
      startOfWeek.setHours(0, 0, 0, 0);
      buckets = Array.from({ length: 7 }, (_, i) => {
        const start = new Date(startOfWeek);
        start.setDate(startOfWeek.getDate() + i);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return {
          label: start.toLocaleDateString("en-US", { weekday: "long" }),
          start,
          end,
        };
      });
    } else if (normalized === "month") {
      const daysInMonth = new Date(
        currentYear,
        today.getMonth() + 1,
        0,
      ).getDate();
      buckets = Array.from({ length: daysInMonth }, (_, i) => {
        const start = new Date(currentYear, today.getMonth(), i + 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return { label: String(i + 1), start, end };
      });
    } else {
      // year | yoy
      buckets = Array.from({ length: 12 }, (_, i) => {
        const start = new Date(currentYear, i, 1);
        const end = new Date(currentYear, i + 1, 0, 23, 59, 59, 999);
        const prevStart = new Date(currentYear - 1, i, 1);
        const prevEnd = new Date(currentYear - 1, i + 1, 0, 23, 59, 59, 999);
        return {
          label: start.toLocaleDateString("en-US", { month: "long" }),
          start,
          end,
          prevStart,
          prevEnd,
        };
      });
    }

    type Cell = {
      patients: Record<string, number>;
      appointments: Record<string, number>;
      compare?: {
        patients: Record<string, number>;
        appointments: Record<string, number>;
      };
    };

    const result: Record<string, Cell> = {};
    for (const b of buckets) {
      result[b.label] = {
        patients: { male: 0, female: 0 },
        appointments: { male: 0, female: 0 },
        ...(normalized === "yoy"
          ? {
              compare: {
                patients: { male: 0, female: 0 },
                appointments: { male: 0, female: 0 },
              },
            }
          : {}),
      };
    }

    for (const gender of ["male", "female"] as const) {
      for (const b of buckets) {
        const [patients, appointments] = await Promise.all([
          prisma.appointment.findMany({
            where: {
              doctorId: sessionUser.id,
              appointmentDate: { gte: b.start, lte: b.end },
              status: { notIn: allowedStatus },
              patient: { user: { gender } },
            },
            distinct: ["patientId"],
            select: { patientId: true },
          }),
          prisma.appointment.count({
            where: {
              doctorId: sessionUser.id,
              appointmentDate: { gte: b.start, lte: b.end },
              status: { notIn: allowedStatus },
              patient: { user: { gender } },
            },
          }),
        ]);

        result[b.label].patients[gender] = patients.length;
        result[b.label].appointments[gender] = appointments;

        if (normalized === "yoy" && b.prevStart && b.prevEnd && result[b.label].compare) {
          const [prevPatients, prevAppointments] = await Promise.all([
            prisma.appointment.findMany({
              where: {
                doctorId: sessionUser.id,
                appointmentDate: { gte: b.prevStart, lte: b.prevEnd },
                status: { notIn: allowedStatus },
                patient: { user: { gender } },
              },
              distinct: ["patientId"],
              select: { patientId: true },
            }),
            prisma.appointment.count({
              where: {
                doctorId: sessionUser.id,
                appointmentDate: { gte: b.prevStart, lte: b.prevEnd },
                status: { notIn: allowedStatus },
                patient: { user: { gender } },
              },
            }),
          ]);
          result[b.label].compare!.patients[gender] = prevPatients.length;
          result[b.label].compare!.appointments[gender] = prevAppointments;
        }
      }
    }

    return result;
  }

  /** Personal appearance: dashboard bg and/or text size. */
  static async updateThemePreferences(
    sessionUser: SessionUser,
    data: { bgSrc?: string | null; textSize?: string | null },
    redis: RedisClient,
  ) {
    const patch: { bgSrc?: string | null; textSize?: string | null } = {};

    if (data.bgSrc !== undefined) {
      patch.bgSrc =
        data.bgSrc == null || !String(data.bgSrc).trim()
          ? null
          : String(data.bgSrc).trim();
    }

    if (data.textSize !== undefined) {
      const size = String(data.textSize || "")
        .trim()
        .toLowerCase();
      const allowed = new Set(["small", "medium", "large"]);
      if (!allowed.has(size)) {
        throw new AppError(400, "textSize must be small, medium, or large.");
      }
      patch.textSize = size;
    }

    if (patch.bgSrc === undefined && patch.textSize === undefined) {
      throw new AppError(400, "Provide bgSrc and/or textSize to update.");
    }

    const updated = await prisma.user.update({
      where: { id: sessionUser.id },
      data: patch,
      select: { bgSrc: true, textSize: true },
    });

    const doctorId = uuidToBase64(sessionUser.id);
    try {
      await redis.del(`users:doctor:${doctorId}:info`);
    } catch {
      /* redis optional */
    }

    return {
      bg_src: updated.bgSrc,
      text_size: updated.textSize ?? "medium",
    };
  }
}
