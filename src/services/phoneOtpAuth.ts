/**
 * Patient login OTP via GlucoGuide's own WhatsApp line (+91 99900 52082).
 * Never send login OTPs from clinic pool numbers.
 */
import { createHash, randomInt } from "crypto";
import type { Response } from "express";
import { prisma } from "../db/prisma.js";
import { settings } from "../config/index.js";
import { AppError, ResponseHandler } from "../core/response.js";
import { generateHash, getUserToken, setTokenCookies } from "../core/security.js";
import { allocatePatientMrn } from "../core/patientMrn.js";
import { getRedis } from "../db/redis.js";
import { sendWhatsAppText } from "./procto/whatsapp.client.js";

const OTP_TTL_SEC = 5 * 60;
/** Production resend gate; QA_EXPOSE_OTP shortens for Playwright / local E2E. */
const RESEND_COOLDOWN_SEC = settings.qaExposeOtp ? 2 : 45;
const MAX_ATTEMPTS = 5;
const OTP_LEN = 6;

type OtpRecord = {
  hash: string;
  attempts: number;
  createdAt: number;
};

/** In-memory fallback when Redis is down (local/dev). */
const memoryOtp = new Map<string, OtpRecord>();
const memoryCooldown = new Map<string, number>();

export function normalizeIndianMobile(input: string): string {
  const digits = String(input || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (last10.length !== 10 || !/^[6-9]/.test(last10)) {
    throw new AppError(400, "Enter a valid 10-digit Indian mobile number.");
  }
  return last10;
}

function otpKey(phone: string): string {
  return `gg:otp:login:${phone}`;
}

function cooldownKey(phone: string): string {
  return `gg:otp:cd:${phone}`;
}

function hashOtp(phone: string, code: string): string {
  return createHash("sha256")
    .update(`${phone}:${code}:${settings.hashingSecretKey}`)
    .digest("hex");
}

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(OTP_LEN, "0");
}

async function storeOtp(phone: string, code: string): Promise<void> {
  const record: OtpRecord = {
    hash: hashOtp(phone, code),
    attempts: 0,
    createdAt: Date.now(),
  };
  try {
    const redis = getRedis();
    await redis.set(otpKey(phone), JSON.stringify(record), "EX", OTP_TTL_SEC);
    await redis.set(cooldownKey(phone), "1", "EX", RESEND_COOLDOWN_SEC);
    return;
  } catch {
    memoryOtp.set(phone, record);
    memoryCooldown.set(phone, Date.now() + RESEND_COOLDOWN_SEC * 1000);
    setTimeout(() => memoryOtp.delete(phone), OTP_TTL_SEC * 1000).unref?.();
  }
}

async function onCooldown(phone: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const v = await redis.get(cooldownKey(phone));
    return Boolean(v);
  } catch {
    const until = memoryCooldown.get(phone) ?? 0;
    return Date.now() < until;
  }
}

async function loadOtp(phone: string): Promise<OtpRecord | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(otpKey(phone));
    if (!raw) return null;
    return JSON.parse(raw) as OtpRecord;
  } catch {
    return memoryOtp.get(phone) ?? null;
  }
}

async function saveOtp(phone: string, record: OtpRecord): Promise<void> {
  try {
    const redis = getRedis();
    const ttl = await redis.ttl(otpKey(phone));
    await redis.set(
      otpKey(phone),
      JSON.stringify(record),
      "EX",
      ttl > 0 ? ttl : OTP_TTL_SEC,
    );
  } catch {
    memoryOtp.set(phone, record);
  }
}

async function clearOtp(phone: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(otpKey(phone));
  } catch {
    memoryOtp.delete(phone);
  }
}

/**
 * Send OTP from GlucoGuide platform WhatsApp only.
 * Prefer AUTHENTICATION template when approved; otherwise session/text from the same line.
 */
async function deliverOtp(phone: string, code: string): Promise<{
  ok: boolean;
  simulated?: boolean;
  error?: string;
  usedTemplate?: boolean;
}> {
  const phoneNumberId =
    settings.glucoguideOtpPhoneNumberId?.trim() ||
    settings.whatsappPhoneNumberId?.trim();
  const to = phone;
  const body =
    `*GlucoGuide* login code: *${code}*\n` +
    `Valid for 5 minutes. Do not share this code.\n` +
    `If you did not request this, ignore the message.`;

  // AUTHENTICATION template (submit on Meta as glucoguide_login_otp).
  const token = settings.whatsappAccessToken;
  if (token && phoneNumberId) {
    try {
      const url = `https://graph.facebook.com/${settings.whatsappApiVersion}/${phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone.replace(/\D/g, "").length === 10
            ? `91${phone.replace(/\D/g, "")}`
            : phone.replace(/\D/g, ""),
          type: "template",
          template: {
            name: "glucoguide_login_otp",
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: code }],
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: code }],
              },
            ],
          },
        }),
      });
      const data = (await res.json()) as {
        messages?: { id: string }[];
        error?: { message: string; code?: number };
      };
      if (res.ok) {
        return { ok: true, usedTemplate: true };
      }
      console.warn(
        `[otp] AUTH template failed (${data.error?.message}); falling back to text`,
      );
    } catch (err) {
      console.warn(
        "[otp] AUTH template error:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const text = await sendWhatsAppText(to, body, phoneNumberId || undefined);
  return text;
}

export class PhoneOtpAuthService {
  /** Request a login OTP on WhatsApp from GlucoGuide's number. */
  static async requestOtp(input: { phone: string }, res: Response) {
    const phone = normalizeIndianMobile(input.phone);

    if (await onCooldown(phone)) {
      throw new AppError(
        429,
        `Please wait ${RESEND_COOLDOWN_SEC}s before requesting another code.`,
      );
    }

    const code = generateOtpCode();
    await storeOtp(phone, code);
    const delivered = await deliverOtp(phone, code);

    if (!delivered.ok && !delivered.simulated) {
      await clearOtp(phone);
      throw new AppError(
        502,
        delivered.error ||
          "Could not send OTP on WhatsApp. Try again in a moment.",
      );
    }

    const expose =
      settings.qaExposeOtp ||
      delivered.simulated ||
      process.env.NODE_ENV !== "production";

    return ResponseHandler.fetchSuccessful(res, "OTP sent on WhatsApp.", {
      phone,
      via: "whatsapp",
      from: settings.glucoguideOtpPhone.slice(-10) || "9990052082",
      expiresInSec: OTP_TTL_SEC,
      ...(expose ? { debugOtp: code } : {}),
      simulated: Boolean(delivered.simulated),
    });
  }

  /** Verify OTP and issue the same JWT session as password login (patients only). */
  static async verifyOtp(
    input: { phone: string; code: string; name?: string },
    res: Response,
  ) {
    const phone = normalizeIndianMobile(input.phone);
    const code = String(input.code || "").replace(/\D/g, "");
    if (code.length !== OTP_LEN) {
      throw new AppError(400, "Enter the 6-digit code from WhatsApp.");
    }

    const record = await loadOtp(phone);
    if (!record) {
      throw new AppError(400, "Code expired or not requested. Request a new OTP.");
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await clearOtp(phone);
      throw new AppError(429, "Too many attempts. Request a new OTP.");
    }

    const ok = record.hash === hashOtp(phone, code);
    if (!ok) {
      record.attempts += 1;
      await saveOtp(phone, record);
      throw new AppError(401, "Invalid code. Check WhatsApp and try again.");
    }

    await clearOtp(phone);

    let user = await prisma.user.findFirst({
      where: {
        role: "user",
        OR: [
          { phone: { endsWith: phone } },
          { patient: { contactNumber: { endsWith: phone } } },
        ],
      },
      include: { patient: true },
    });

    if (!user) {
      const name = input.name?.trim() || `Patient ${phone.slice(-4)}`;
      const email = `wa${phone}@patients.glucoguide.local`;
      const tempPassword = await generateHash(
        `otp-${phone}-${Date.now()}-${Math.random()}`,
      );
      user = await prisma.user.create({
        data: {
          email,
          password: tempPassword,
          role: "user",
          name,
          phone,
          createdBy: "phone_otp",
          patient: {
            create: {
              mrn: await allocatePatientMrn(),
              contactNumber: phone,
            },
          },
        },
        include: { patient: true },
      });
    } else {
      // Keep phone + contactNumber aligned after verified OTP login.
      await prisma.user.update({
        where: { id: user.id },
        data: {
          phone: user.phone?.endsWith(phone) ? user.phone : phone,
          patient: user.patient
            ? {
                update: {
                  contactNumber:
                    user.patient.contactNumber?.endsWith(phone)
                      ? user.patient.contactNumber
                      : phone,
                },
              }
            : {
                create: {
                  mrn: await allocatePatientMrn(),
                  contactNumber: phone,
                },
              },
        },
      });
    }

    const sessionUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      password: user.password,
    };
    const tokenResult = getUserToken(sessionUser, 200);
    setTokenCookies(res, tokenResult.cookies);
    return res.status(200).json({
      status: "successful",
      message: "logged in.",
      ...tokenResult.responseBody,
    });
  }
}
