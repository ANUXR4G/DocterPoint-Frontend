import type { RedisClient } from "../../types/index.js";
import { prisma } from "../../db/prisma.js";
import { base64ToUuid } from "../../core/security.js";
import { getCachedJson, setCachedJson } from "../../db/redis.js";
import { DoctorSerialization } from "../serialization.js";
import type { SessionUser } from "../../types/index.js";

export class PatientService {
  static async getPatients(
    doctorId: string,
    sessionUser: SessionUser,
    redis: RedisClient,
    q?: string,
    age?: string,
    gender?: string,
    page = 1,
    limit = 10,
  ) {
    const redisKey = `users:doctor:${doctorId}:patients:page:${page}`;
    const redisKeyTotal = `users:doctor:${doctorId}:patients:total`;
    page = Math.max(1, page);
    const offset = (page - 1) * limit;
    const noFilterApplied = !q && !age && !gender;

    if (noFilterApplied) {
      const cachedPatients = await getCachedJson<unknown[]>(redisKey);
      const cachedTotal = await getCachedJson<number>(redisKeyTotal);
      if (cachedPatients && cachedTotal !== null) {
        return { total: cachedTotal, patients: cachedPatients };
      }
    }

    const appointmentPatients = await prisma.appointment.findMany({
      where: { doctorId: sessionUser.id },
      distinct: ["patientId"],
      select: { patientId: true },
    });

    const patientIds = appointmentPatients.map((item) => item.patientId);
    const where: Record<string, unknown> = {
      id: { in: patientIds },
    };

    if (q) {
      where.user = { name: { contains: q, mode: "insensitive" } };
    }

    if (gender && ["male", "female"].includes(gender)) {
      where.user = {
        ...(where.user as Record<string, unknown>),
        gender,
      };
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        include: { user: true },
        skip: offset,
        take: limit,
      }),
      prisma.appointment.findMany({
        where: {
          doctorId: sessionUser.id,
          ...(q ? { patient: { user: { name: { contains: q, mode: "insensitive" } } } } : {}),
          ...(gender && ["male", "female"].includes(gender)
            ? { patient: { user: { gender } } }
            : {}),
        },
        distinct: ["patientId"],
        select: { patientId: true },
      }).then((rows) => rows.length),
    ]);

    let sortedPatients = patients;

    if (age && ["young", "old"].includes(age)) {
      sortedPatients = [...patients].sort((a, b) => {
        const ageA = parseBirthDate(a.dateOfBirth);
        const ageB = parseBirthDate(b.dateOfBirth);
        return age === "young" ? ageB - ageA : ageA - ageB;
      });
    }

    const result = sortedPatients.map((patient) =>
      DoctorSerialization.patientInfo({
        id: patient.id,
        email: patient.user.email,
        name: patient.user.name,
        gender: patient.user.gender,
        imgSrc: patient.user.imgSrc,
        address: patient.user.address,
        profession: patient.profession,
        dateOfBirth: patient.dateOfBirth,
        contactNumber: patient.contactNumber,
        emergencyNumber: patient.emergencyNumber,
      }),
    );

    if (noFilterApplied) {
      await setCachedJson(redisKey, result);
      await setCachedJson(redisKeyTotal, total);
    }

    return { total, patients: result };
  }

  static async getPatientAppointments(patientId: string, doctor: SessionUser) {
    const patientUuid = base64ToUuid(patientId);

    const appointments = await prisma.appointment.findMany({
      where: {
        patientId: patientUuid,
        doctorId: doctor.id,
        status: { notIn: ["cancelled", "declined", "requested"] },
      },
      include: {
        doctor: {
          include: {
            user: { select: { name: true } },
            hospital: { select: { id: true, name: true, address: true } },
          },
        },
      },
      take: 10,
      orderBy: { appointmentDate: "desc" },
    });

    return appointments.map((appointment) =>
      DoctorSerialization.patientAppointment({
        ...appointment,
        doctor: {
          id: appointment.doctorId,
          name: appointment.doctor.user.name,
          hospital: appointment.doctor.hospital,
        },
      }),
    );
  }
}

function parseBirthDate(dateOfBirth: string | null): number {
  if (!dateOfBirth) return 0;
  const parts = dateOfBirth.split("/").map(Number);
  if (parts.length !== 3) return 0;
  const [month, day, year] = parts;
  const birth = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}
