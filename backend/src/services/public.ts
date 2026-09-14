import { prisma } from "../db/prisma.js";
import { uuidToBase64, base64ToUuid } from "../core/security.js";
import { getCachedJson, setCachedJson } from "../db/redis.js";
import { ResponseHandler } from "../core/response.js";
import type { RedisClient } from "../types/index.js";

function serializedHospital(hospital: {
  id: string;
  name: string;
  address: string;
  city: string;
  imgSrc: string;
  description: string;
  emails: unknown;
  contactNumbers: unknown;
  geometry: unknown;
}) {
  return {
    id: uuidToBase64(hospital.id),
    name: hospital.name,
    address: hospital.address,
    city: hospital.city,
    img_src: hospital.imgSrc,
    description: hospital.description,
    emails: hospital.emails,
    contact_numbers: hospital.contactNumbers,
    geometry: hospital.geometry,
  };
}

function serializedDoctor(
  doctor: {
    id: string;
    description: string;
    availableTimes: string;
    experience: number;
    emails: unknown;
    contactNumbers: unknown;
    user: {
      name: string | null;
      gender: string | null;
      imgSrc: string | null;
      address: string | null;
      email: string;
    };
    hospital: {
      id: string;
      name: string;
      city: string;
      address: string;
    };
  },
) {
  return {
    id: uuidToBase64(doctor.id),
    hospital: {
      id: uuidToBase64(doctor.hospital.id),
      name: doctor.hospital.name,
      city: doctor.hospital.city,
      address: doctor.hospital.address,
    },
    description: doctor.description,
    available_times: doctor.availableTimes,
    experience: doctor.experience,
    emails: doctor.emails,
    contact_numbers: doctor.contactNumbers,
    name: doctor.user.name,
    gender: doctor.user.gender,
    img_src: doctor.user.imgSrc,
    address: doctor.user.address,
    email: doctor.user.email,
  };
}

export class DoctorService {
  static async getAllDoctors(
    redis: RedisClient,
    q?: string,
    page = 1,
    limit = 10,
    hospitals?: string[],
    locations?: string[],
    experience?: number,
  ) {
    page = Math.max(1, page);
    const offset = (page - 1) * limit;
    const redisKey = `doctors:page:${page}`;
    const redisKeyTotal = "doctors:total";

    if (!q && !hospitals?.length && !locations?.length && !experience) {
      const cachedDoctors = await getCachedJson<unknown[]>(redisKey);
      const cachedTotal = await getCachedJson<number>(redisKeyTotal);
      if (cachedDoctors && cachedTotal !== null) {
        return { total: cachedTotal, doctors: cachedDoctors };
      }
    }

    const where: Record<string, unknown> = {};
    const andConditions: Record<string, unknown>[] = [];

    if (q) {
      andConditions.push({
        user: { name: { contains: q, mode: "insensitive" } },
      });
    }
    if (experience) {
      andConditions.push({ experience: { gte: experience } });
    }
    if (hospitals?.length) {
      andConditions.push({ hospital: { name: { in: hospitals } } });
    }
    if (locations?.length) {
      andConditions.push({ hospital: { city: { in: locations } } });
    }
    if (andConditions.length) {
      where.AND = andConditions;
    }

    const [total, doctors] = await Promise.all([
      prisma.doctor.count({ where }),
      prisma.doctor.findMany({
        where,
        include: {
          user: true,
          hospital: { select: { id: true, name: true, city: true, address: true } },
        },
        skip: offset,
        take: limit,
      }),
    ]);

    const filteredDoctors = doctors.map(serializedDoctor);

    if (!q && !hospitals?.length && !locations?.length && !experience) {
      await setCachedJson(redisKeyTotal, total);
      await setCachedJson(redisKey, filteredDoctors);
    }

    return { total, doctors: filteredDoctors };
  }

  static async getDoctorById(doctorId: string, redis: RedisClient) {
    const redisKey = `doctors:info:${doctorId}`;
    const cached = await getCachedJson<Record<string, unknown>>(redisKey);
    if (cached) return cached;

    const doctor = await prisma.doctor.findUnique({
      where: { id: base64ToUuid(doctorId) },
      include: {
        user: true,
        hospital: { select: { id: true, name: true, city: true, address: true } },
      },
    });

    if (!doctor) {
      ResponseHandler.notFoundError("doctor not found");
    }

    const doctorInfo = serializedDoctor(doctor!);
    await setCachedJson(redisKey, doctorInfo);
    return doctorInfo;
  }

  static async getDoctorsByHospitalId(
    hospitalId: string,
    redis: RedisClient,
    page = 1,
    limit = 10,
  ) {
    const hospitalUuid = base64ToUuid(hospitalId);
    page = Math.max(1, page);
    const offset = (page - 1) * limit;
    const redisKey = `doctors:hospital:${hospitalId}:page:${page}`;
    const redisKeyTotal = `doctors:hospital:${hospitalId}:total`;

    const cachedDoctors = await getCachedJson<unknown[]>(redisKey);
    const cachedTotal = await getCachedJson<number>(redisKeyTotal);
    if (cachedDoctors && cachedTotal !== null) {
      return { total: cachedTotal, doctors: cachedDoctors };
    }

    const where = { hospitalId: hospitalUuid };
    const [total, doctors] = await Promise.all([
      prisma.doctor.count({ where }),
      prisma.doctor.findMany({
        where,
        include: {
          user: true,
          hospital: { select: { id: true, name: true, city: true, address: true } },
        },
        skip: offset,
        take: limit,
      }),
    ]);

    const filteredDoctors = doctors.map(serializedDoctor);
    await setCachedJson(redisKeyTotal, total);
    await setCachedJson(redisKey, filteredDoctors);

    return { total, doctors: filteredDoctors };
  }
}

export class HospitalService {
  static async getAllNames(redis: RedisClient) {
    const redisKey = "hospitals:names";
    const cached = await getCachedJson<string[]>(redisKey);
    if (cached) return cached;

    const hospitals = await prisma.hospital.findMany({
      select: { name: true },
      distinct: ["name"],
    });
    const names = hospitals.map((h) => h.name);
    await setCachedJson(redisKey, names);
    return names;
  }

  static async getAllLocations(redis: RedisClient) {
    const redisKey = "hospitals:locations";
    const cached = await getCachedJson<string[]>(redisKey);
    if (cached) return cached;

    const hospitals = await prisma.hospital.findMany({
      select: { city: true },
      distinct: ["city"],
    });
    const locations = hospitals.map((h) => h.city);
    await setCachedJson(redisKey, locations);
    return locations;
  }

  static async getAllHospitals(
    redis: RedisClient,
    q?: string,
    page = 1,
    limit = 10,
    locations?: string[],
  ) {
    page = Math.max(1, page);
    const offset = (page - 1) * limit;
    const redisKey = `hospitals:page:${page}`;
    const redisKeyTotal = "hospitals:total";

    if (!q && !locations?.length) {
      const cachedHospitals = await getCachedJson<unknown[]>(redisKey);
      const cachedTotal = await getCachedJson<number>(redisKeyTotal);
      if (cachedHospitals && cachedTotal !== null) {
        return { total: cachedTotal, hospitals: cachedHospitals };
      }
    }

    const andConditions: Record<string, unknown>[] = [];
    if (q) andConditions.push({ name: { contains: q, mode: "insensitive" } });
    if (locations?.length) andConditions.push({ city: { in: locations } });

    const where = andConditions.length ? { AND: andConditions } : {};

    const [total, hospitals] = await Promise.all([
      prisma.hospital.count({ where }),
      prisma.hospital.findMany({ where, skip: offset, take: limit }),
    ]);

    const filteredHospitals = hospitals.map(serializedHospital);

    if (!q && !locations?.length) {
      await setCachedJson(redisKeyTotal, total);
      await setCachedJson(redisKey, filteredHospitals);
    }

    return { total, hospitals: filteredHospitals };
  }

  static async getHospitalById(hospitalId: string, redis: RedisClient) {
    const redisKey = `hospitals:info:${hospitalId}`;
    const cached = await getCachedJson<Record<string, unknown>>(redisKey);
    if (cached) return cached;

    const hospital = await prisma.hospital.findUnique({
      where: { id: base64ToUuid(hospitalId) },
    });

    if (!hospital) {
      ResponseHandler.notFoundError(`hospital not found ${hospitalId}`);
    }

    const hospitalInfo = serializedHospital(hospital!);
    await setCachedJson(redisKey, hospitalInfo);
    return hospitalInfo;
  }
}
