import { PrismaClient } from "@prisma/client";
import { databaseUrl } from "../config/index.js";

/** Cap Prisma connections against Supabase session pooler (EMAXCONNSESSION). */
function withPoolLimits(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", "5");
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "10");
    }
    return u.toString();
  } catch {
    return url;
  }
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: withPoolLimits(databaseUrl),
    },
  },
});

export async function getPatientSession(userId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: userId },
    include: { user: true },
  });
  if (!patient) return null;
  return mergePatient(patient.user, patient);
}

export async function getDoctorSession(userId: string) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: userId },
    include: { user: true },
  });
  if (!doctor) return null;
  return mergeDoctor(doctor.user, doctor);
}

export function mergePatient(
  user: {
    id: string;
    email: string;
    password: string | null;
    role: string;
    name: string | null;
    gender: string | null;
    imgSrc: string | null;
    address: string | null;
  },
  patient: {
    profession: string | null;
    dateOfBirth: string | null;
    contactNumber: string | null;
    emergencyNumber: string | null;
  },
) {
  return {
    id: user.id,
    email: user.email,
    password: user.password,
    role: user.role,
    name: user.name,
    gender: user.gender,
    imgSrc: user.imgSrc,
    address: user.address,
    profession: patient.profession,
    dateOfBirth: patient.dateOfBirth,
    contactNumber: patient.contactNumber,
    emergencyNumber: patient.emergencyNumber,
  };
}

export function mergeDoctor(
  user: {
    id: string;
    email: string;
    password: string | null;
    role: string;
    name: string | null;
    gender: string | null;
    imgSrc: string | null;
    address: string | null;
  },
  doctor: {
    description: string;
    hospitalId: string;
    availableTimes: string;
    experience: number;
    emails: unknown;
    contactNumbers: unknown;
  },
) {
  return {
    id: user.id,
    email: user.email,
    password: user.password,
    role: user.role,
    name: user.name,
    gender: user.gender,
    imgSrc: user.imgSrc,
    address: user.address,
    description: doctor.description,
    hospitalId: doctor.hospitalId,
    availableTimes: doctor.availableTimes,
    experience: doctor.experience,
    emails: doctor.emails,
    contactNumbers: doctor.contactNumbers,
  };
}
