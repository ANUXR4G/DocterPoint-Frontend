import type { Redis } from "ioredis";

export type RedisClient = Redis;

export type SessionUser = {
  id: string;
  email: string;
  role: string;
  name?: string | null;
  gender?: string | null;
  imgSrc?: string | null;
  address?: string | null;
  password?: string | null;
} & {
  profession?: string | null;
  dateOfBirth?: string | null;
  contactNumber?: string | null;
  emergencyNumber?: string | null;
  description?: string;
  hospitalId?: string;
  availableTimes?: string;
  experience?: number;
  emails?: unknown;
  contactNumbers?: unknown;
};

export type PatientSession = SessionUser & {
  role: "user";
};

export type DoctorSession = SessionUser & {
  role: "doctor";
};

export type MergedPatient = {
  id: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

export type MergedDoctor = {
  id: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

export interface PaginatedQuery {
  q?: string;
  page?: string;
  limit?: string;
}
