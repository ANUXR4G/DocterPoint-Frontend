import { prisma } from "../db/prisma.js";
import { uuidToBase64 } from "../core/security.js";
import { getCachedJson, setCachedJson } from "../db/redis.js";
import { ResponseHandler } from "../core/response.js";
import type { RedisClient, SessionUser } from "../types/index.js";
import {
  decrypt,
  generateHash,
  verifyPassword,
} from "../core/security.js";
import { AppError } from "../core/response.js";
import { noneExcluded } from "../core/utils.js";
import { normalizeGender, requireGender } from "../core/gender.js";
import {
  saveAadharCardImage,
  saveProfilePhotoImage,
} from "../lib/patientDocuments.js";

function normalizeAadharInput(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new AppError(400, "Aadhaar number must be 12 digits.");
  }
  const digits = String(value).replace(/\D/g, "");
  if (digits.length !== 12) {
    throw new AppError(400, "Aadhaar number must be exactly 12 digits.");
  }
  return digits;
}

function normalizePanInput(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new AppError(400, "PAN must be 10 characters (e.g. ABCDE1234F).");
  }
  const pan = value.trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    throw new AppError(400, "PAN must be 10 characters (e.g. ABCDE1234F).");
  }
  return pan;
}

function profileData(data: Record<string, unknown>) {
  const { id, ...rest } = data;
  return {
    id: uuidToBase64(String(id)),
    ...Object.fromEntries(
      Object.entries(rest).map(([key, value]) => [
        key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`),
        value,
      ]),
    ),
  };
}

export class PatientService {
  static async getProfileInfo(sessionUser: SessionUser, redis: RedisClient) {
    const patientId = uuidToBase64(sessionUser.id);
    const redisKey = `patients:info:${patientId}`;

    const cached = await getCachedJson<Record<string, unknown>>(redisKey);
    if (cached) return cached;

    const patient = await prisma.patient.findUnique({
      where: { id: sessionUser.id },
      include: { user: true },
    });

    if (!patient) {
      ResponseHandler.notFoundError("patient information no found.");
    }

    const patientInfoData = profileData({
      id: patient!.id,
      email: patient!.user.email,
      role: patient!.user.role,
      name: patient!.user.name,
      gender: patient!.user.gender,
      imgSrc: patient!.user.imgSrc,
      textSize: patient!.user.textSize,
      bgSrc: patient!.user.bgSrc,
      address: patient!.user.address,
      profession: patient!.profession,
      dateOfBirth: patient!.dateOfBirth,
      contactNumber: patient!.contactNumber,
      emergencyNumber: patient!.emergencyNumber,
      aadharNumber: patient!.aadharNumber,
      panNumber: patient!.panNumber,
      aadharCardSrc: patient!.aadharCardSrc,
    });

    await setCachedJson(redisKey, patientInfoData);
    return patientInfoData;
  }

  static async changePatientInformation(
    updatedData: Record<string, unknown>,
    sessionUser: SessionUser,
    redis: RedisClient,
  ) {
    const payload = noneExcluded(updatedData);

    const userFields = ["email", "name", "gender", "address", "imgSrc", "img_src"];
    const patientFields = [
      "profession",
      "dateOfBirth",
      "date_of_birth",
      "contactNumber",
      "contact_number",
      "emergencyNumber",
      "emergency_number",
      "aadharNumber",
      "aadhar_number",
      "panNumber",
      "pan_number",
    ];

    const userUpdate: Record<string, unknown> = { updatedAt: new Date() };
    const patientUpdate: Record<string, unknown> = {};
    let genderTouched = false;

    for (const [key, value] of Object.entries(payload)) {
      if (key === "img_src") userUpdate.imgSrc = value;
      else if (key === "date_of_birth") patientUpdate.dateOfBirth = value;
      else if (key === "contact_number") patientUpdate.contactNumber = value;
      else if (key === "emergency_number") patientUpdate.emergencyNumber = value;
      else if (key === "aadhar_number" || key === "aadharNumber") {
        patientUpdate.aadharNumber = normalizeAadharInput(value);
      } else if (key === "pan_number" || key === "panNumber") {
        patientUpdate.panNumber = normalizePanInput(value);
      } else if (key === "gender") {
        userUpdate.gender = requireGender(value);
        genderTouched = true;
      } else if (userFields.includes(key)) userUpdate[key] = value;
      else if (patientFields.includes(key)) patientUpdate[key] = value;
    }

    if (!genderTouched) {
      const existing = await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: { gender: true },
      });
      if (!normalizeGender(existing?.gender)) {
        throw new AppError(
          400,
          "Gender is required. Choose male, female, or others.",
        );
      }
    }

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: userUpdate,
    });

    if (Object.keys(patientUpdate).length > 0) {
      await prisma.patient.update({
        where: { id: sessionUser.id },
        data: patientUpdate,
      });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: sessionUser.id },
      include: { user: true },
    });

    const appointmentInfoData = profileData({
      id: patient!.id,
      email: patient!.user.email,
      role: patient!.user.role,
      name: patient!.user.name,
      gender: patient!.user.gender,
      imgSrc: patient!.user.imgSrc,
      address: patient!.user.address,
      profession: patient!.profession,
      dateOfBirth: patient!.dateOfBirth,
      contactNumber: patient!.contactNumber,
      emergencyNumber: patient!.emergencyNumber,
      aadharNumber: patient!.aadharNumber,
      panNumber: patient!.panNumber,
      aadharCardSrc: patient!.aadharCardSrc,
    });

    const redisKey = `patients:info:${uuidToBase64(sessionUser.id)}`;
    await setCachedJson(redisKey, appointmentInfoData);
    return appointmentInfoData;
  }

  static async changeUserPassword(
    updatedData: { old_password: string; new_password: string },
    sessionUser: SessionUser,
  ) {
    const decryptedOldPass = decrypt(updatedData.old_password);
    const decryptedNewPass = decrypt(updatedData.new_password);

    if (!sessionUser.password || !(await verifyPassword(decryptedOldPass, sessionUser.password))) {
      throw new AppError(400, `old password is incorrect - ${sessionUser.id}`);
    }

    const newHashedPass = await generateHash(decryptedNewPass);

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: {
        password: newHashedPass,
        updatedAt: new Date(),
      },
    });

    return { status: "successful", message: "successfully changed user password." };
  }

  /** Patient appearance preference (text size and/or dashboard background). */
  static async updateThemePreferences(
    sessionUser: SessionUser,
    data: { textSize?: string | null; bgSrc?: string | null },
    redis: RedisClient,
  ) {
    const patch: { textSize?: string | null; bgSrc?: string | null } = {};

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

    const patientId = uuidToBase64(sessionUser.id);
    try {
      await redis.del(`patients:info:${patientId}`);
    } catch {
      /* redis optional */
    }

    return {
      bg_src: updated.bgSrc,
      text_size: updated.textSize ?? "medium",
    };
  }

  static async uploadAadharCard(
    sessionUser: SessionUser,
    data: { imageBase64: string; mimeType?: string },
    redis: RedisClient,
  ) {
    const src = await saveAadharCardImage(
      sessionUser.id,
      data.imageBase64,
      data.mimeType,
    );
    await prisma.patient.update({
      where: { id: sessionUser.id },
      data: { aadharCardSrc: src },
    });

    const patientId = uuidToBase64(sessionUser.id);
    try {
      await redis.del(`patients:info:${patientId}`);
    } catch {
      /* redis optional */
    }

    return { aadhar_card_src: src, aadharCardSrc: src };
  }

  static async uploadProfilePhoto(
    sessionUser: SessionUser,
    data: { imageBase64: string; mimeType?: string },
    redis: RedisClient,
  ) {
    const src = await saveProfilePhotoImage(
      sessionUser.id,
      data.imageBase64,
      data.mimeType,
    );
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { imgSrc: src },
    });

    const patientId = uuidToBase64(sessionUser.id);
    try {
      await redis.del(`patients:info:${patientId}`);
    } catch {
      /* redis optional */
    }

    return { img_src: src, imgSrc: src };
  }

  /** Lookup patient by WhatsApp / contact phone (last 10 digits). */
  static async findByPhone(phone: string) {
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (digits.length < 10) return null;

    const user = await prisma.user.findFirst({
      where: {
        role: "user",
        OR: [
          { phone: { endsWith: digits } },
          { patient: { contactNumber: { endsWith: digits } } },
        ],
      },
      include: { patient: true },
    });
    return user;
  }

  /**
   * Create a patient account from WhatsApp chat.
   * Requires a real email for the profile; patients sign in with phone OTP (not email).
   */
  static async registerViaWhatsApp(data: {
    phone: string;
    name: string;
    gender?: string;
    dateOfBirth?: string | null;
    email: string;
    address?: string | null;
  }) {
    const phone = data.phone.replace(/\D/g, "").slice(-10);
    if (phone.length < 10) {
      throw new AppError(400, "A valid 10-digit phone is required.");
    }

    // WhatsApp registration is patient-only
    const staffPhone = await prisma.user.findFirst({
      where: {
        role: "doctor",
        phone: { endsWith: phone },
      },
      select: { id: true },
    });
    if (staffPhone) {
      throw new AppError(
        403,
        "Doctor and clinic accounts cannot register via WhatsApp. Use the web portal instead.",
      );
    }
    const staffMember = await prisma.practiceMember.findFirst({
      where: {
        isActive: true,
        role: { in: ["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN", "RECEPTIONIST"] },
        user: { phone: { endsWith: phone } },
      },
      select: { id: true },
    });
    if (staffMember) {
      throw new AppError(
        403,
        "Doctor and clinic accounts cannot register via WhatsApp. Use the web portal instead.",
      );
    }

    const existing = await this.findByPhone(phone);
    if (existing) {
      throw new AppError(
        409,
        `You're already registered as ${existing.name || "a patient"}. Reply *BOOK* to book, or sign in on the app/website with your mobile number.`,
      );
    }

    const name = data.name.trim();
    if (name.length < 2) {
      throw new AppError(400, "Please provide your full name.");
    }

    const email = data.email.trim().toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.endsWith("@patients.glucoguide.local")
    ) {
      throw new AppError(
        400,
        "Please send your real email address (e.g. you@gmail.com).",
      );
    }

    const emailTaken = await prisma.user.findUnique({ where: { email } });
    if (emailTaken) {
      throw new AppError(
        409,
        "That email is already registered. Reply with a different email address.",
      );
    }

    const gender = requireGender(data.gender);

    // Random password for schema only — patients authenticate via phone OTP.
    const hashedPassword = await generateHash(
      `wa-reg-${phone}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    );

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "user",
        name,
        gender,
        phone,
        address: data.address?.trim() || null,
        createdBy: "whatsapp_bot",
        patient: {
          create: {
            contactNumber: phone,
            dateOfBirth: data.dateOfBirth?.trim() || null,
          },
        },
      },
      include: { patient: true },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone,
    };
  }
}
