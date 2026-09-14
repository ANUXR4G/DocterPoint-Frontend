import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { decodeToken, extractTokenFromRequest } from "../core/security.js";
import { prisma, mergePatient, mergeDoctor } from "../db/prisma.js";
import { AppError, ResponseHandler } from "../core/response.js";
import type { SessionUser } from "../types/index.js";
import { DoctorService } from "../services/doctor/general.js";

const doctorProfileSelect = {
  description: true,
  hospitalId: true,
  availableTimes: true,
  experience: true,
  emails: true,
  contactNumbers: true,
} as const;

async function resolveDoctorProfile(userId: string, email: string) {
  const existing = await prisma.doctor.findUnique({
    where: { id: userId },
    select: doctorProfileSelect,
  });
  if (existing) return existing;
  await DoctorService.ensureDoctorRecord(userId, email);
  return prisma.doctor.findUniqueOrThrow({
    where: { id: userId },
    select: doctorProfileSelect,
  });
}

declare global {
  namespace Express {
    interface Request {
      sessionUser?: SessionUser;
    }
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  if (err instanceof AppError) {
    if (err.headers) {
      Object.entries(err.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    return ResponseHandler.unsuccessful(res, err.statusCode, err.message);
  }

  if (err instanceof Error) {
    if ("statusCode" in err && typeof err.statusCode === "number") {
      return ResponseHandler.unsuccessful(res, err.statusCode, err.message);
    }
    if (err.message.startsWith("decryption failed")) {
      return ResponseHandler.unsuccessful(res, 401, err.message);
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return ResponseHandler.unsuccessful(
      res,
      400,
      "Invalid request data. Check enums and required fields.",
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Invalid UUID / value for column — client error, not server fault
    if (err.code === "P2023" || err.code === "P2006") {
      return ResponseHandler.unsuccessful(
        res,
        400,
        "Invalid id or field value in request.",
      );
    }
    if (err.code === "P2022") {
      return ResponseHandler.unsuccessful(
        res,
        500,
        "Database schema is out of date. Run prisma migrate deploy on the API host.",
      );
    }
    if (err.code === "P2021") {
      return ResponseHandler.unsuccessful(
        res,
        500,
        "Database tables missing. Run: npx prisma migrate deploy (and seed if needed).",
      );
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return ResponseHandler.unsuccessful(
      res,
      500,
      "Database unavailable. Check DATABASE_URL / Postgres on Railway.",
    );
  }

  console.error(err);
  return ResponseHandler.unsuccessful(res, 500, "internal server error");
}

export function requireAuth(...requiredScopes: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = extractTokenFromRequest(
        req.headers.authorization,
        req.cookies as Record<string, string>,
      );

      if (!token) {
        ResponseHandler.invalidToken();
      }

      const payload = decodeToken(token!);
      const userId = payload.sub;
      const tokenScopes = payload.scopes ?? [];

      if (!userId) {
        ResponseHandler.invalidToken("invalid token or expired token.");
      }

      if (!requiredScopes.every((scope) => tokenScopes.includes(scope))) {
        ResponseHandler.noPermission("user doesn't have enough permission.");
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          gender: true,
          imgSrc: true,
          address: true,
          password: true,
          patient: {
            select: {
              profession: true,
              dateOfBirth: true,
              contactNumber: true,
              emergencyNumber: true,
            },
          },
          doctor: {
            select: doctorProfileSelect,
          },
        },
      });

      if (!user) {
        ResponseHandler.invalidToken("invalid token or expired token.");
      }

      const authenticatedUser = user!;

      if (authenticatedUser.role === "user") {
        if (!authenticatedUser.patient) {
          ResponseHandler.invalidToken("invalid token or expired token.");
        }
        req.sessionUser = mergePatient(authenticatedUser, authenticatedUser.patient!);
      } else if (authenticatedUser.role === "doctor") {
        const doctorProfile = await resolveDoctorProfile(
          authenticatedUser.id,
          authenticatedUser.email,
        );
        req.sessionUser = mergeDoctor(authenticatedUser, doctorProfile);
      } else {
        req.sessionUser = {
          id: authenticatedUser.id,
          email: authenticatedUser.email,
          role: authenticatedUser.role,
          name: authenticatedUser.name,
          gender: authenticatedUser.gender,
          imgSrc: authenticatedUser.imgSrc,
          address: authenticatedUser.address,
          password: authenticatedUser.password,
        };
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Soft auth — attaches session when cookies/bearer are valid; never 401s. */
export function attachSessionIfPresent() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = extractTokenFromRequest(
        req.headers.authorization,
        req.cookies as Record<string, string>,
      );
      if (!token) {
        next();
        return;
      }
      const payload = decodeToken(token);
      if (!payload.sub) {
        next();
        return;
      }
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          gender: true,
          imgSrc: true,
          address: true,
          password: true,
          patient: {
            select: {
              profession: true,
              dateOfBirth: true,
              contactNumber: true,
              emergencyNumber: true,
            },
          },
          doctor: {
            select: doctorProfileSelect,
          },
        },
      });
      if (!user) {
        next();
        return;
      }
      if (user.role === "user" && user.patient) {
        req.sessionUser = mergePatient(user, user.patient);
      } else if (user.role === "doctor") {
        const doctorProfile = user.doctor
          ? user.doctor
          : await resolveDoctorProfile(user.id, user.email);
        req.sessionUser = mergeDoctor(user, doctorProfile);
      } else {
        req.sessionUser = user;
      }
      next();
    } catch {
      next();
    }
  };
}
