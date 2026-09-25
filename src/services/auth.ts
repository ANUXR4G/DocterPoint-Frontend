import type { Response } from "express";
import { prisma } from "../db/prisma.js";
import {
  generateHash,
  getUserToken,
  setTokenCookies,
  unwrapPassword,
  verifyPassword,
} from "../core/security.js";
import { AppError, ResponseHandler } from "../core/response.js";
import { Custom } from "../core/utils.js";
import { settings, frontendBaseUrl } from "../config/index.js";
import { assertValidTimeRange, minutesOf } from "./procto/slotEngine.js";
import { requireGender } from "../core/gender.js";
import { normalizeDateOfBirth, ageFromDob } from "../core/dob.js";
import { allocatePatientMrn } from "../core/patientMrn.js";

type AuthRole = "user" | "doctor" | "admin";

function normalizeAuthRole(role?: string): AuthRole {
  if (role === "doctor") return "doctor";
  if (role === "admin") return "admin";
  return "user";
}

export class AuthService {
  static async ensureIndependentHospital() {
    const existing = await prisma.hospital.findFirst({
      where: { name: "Independent Practice" },
    });
    if (existing) return existing;

    return prisma.hospital.create({
      data: {
        name: "Independent Practice",
        address: "Online / To be updated",
        city: "Bangalore",
        imgSrc: "https://images.pexels.com/photos/263402/pexels-photo-263402.jpeg",
        description: "Default hospital for newly registered independent doctors.",
        emails: ["support@glucoguide.com"],
        contactNumbers: ["+910000000000"],
        geometry: { type: "Point", coordinates: [77.5946, 12.9716] },
      },
    });
  }

  static async signup(
    credentials: {
      email: string
      password: string
      role?: string
      name?: string
      phone?: string
      gender?: string
      dateOfBirth?: string | null
      date_of_birth?: string | null
      appointmentValidityDays?: number
      /** clinic register → clinic_owner_signup; otherwise self_attempted */
      portal?: string
    },
    res: Response,
  ) {
    const role = normalizeAuthRole(credentials.role);
    const exists = await prisma.user.findUnique({
      where: { email: credentials.email },
    });

    if (exists) {
      throw new AppError(409, `${credentials.email} already exists!`);
    }

    const decryptedPassword = unwrapPassword(credentials.password);
    const hashedPassword = await generateHash(decryptedPassword);
    const phone = credentials.phone?.trim() || null;
    const validity = Math.min(
      90,
      Math.max(1, Number(credentials.appointmentValidityDays) || 7),
    );
    const createdBy =
      role === "doctor" && credentials.portal === "clinic"
        ? "clinic_owner_signup"
        : "self_attempted";

    let user;
    if (role === "doctor") {
      const hospital = await AuthService.ensureIndependentHospital();
      user = await prisma.user.create({
        data: {
          email: credentials.email,
          password: hashedPassword,
          role: "doctor",
          name: credentials.name?.trim() || null,
          phone,
          createdBy,
          doctor: {
            create: {
              description:
                createdBy === "clinic_owner_signup"
                  ? "Clinic owner — practice and trial are set up at registration; add doctors from the clinic dashboard."
                  : "Newly registered doctor — complete your practice profile.",
              hospitalId: hospital.id,
              availableTimes: "Mon–Fri 09:00–17:00",
              experience: 0,
              emails: [credentials.email],
              contactNumbers: phone ? [phone] : [],
              appointmentValidityDays: validity,
            },
          },
        },
        include: { doctor: true },
      });
    } else {
      const gender = requireGender(credentials.gender);
      const dobRaw =
        credentials.dateOfBirth ?? credentials.date_of_birth ?? null;
      const dateOfBirth = normalizeDateOfBirth(dobRaw);
      if (!dateOfBirth) {
        throw new AppError(
          400,
          "Date of birth is required (use DD/MM/YYYY or YYYY-MM-DD).",
        );
      }
      const mrn = await allocatePatientMrn();
      user = await prisma.user.create({
        data: {
          email: credentials.email,
          password: hashedPassword,
          role: "user",
          name: credentials.name?.trim() || null,
          phone,
          gender,
          createdBy: "self_attempted",
          patient: { create: { mrn, dateOfBirth } },
        },
        include: { patient: true },
      });
    }

    const sessionUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      password: user.password,
    };

    const tokenResult = getUserToken(sessionUser, 201);
    setTokenCookies(res, tokenResult.cookies);
    const patientDob =
      role === "user" && "patient" in user
        ? (user.patient?.dateOfBirth ?? null)
        : null;
    return res.status(201).json({
      ...tokenResult.responseBody,
      date_of_birth: patientDob,
      age: patientDob ? ageFromDob(patientDob) : null,
    });
  }

  /**
   * Clinic vs doctor portals share User.role=doctor but require different
   * practice memberships:
   * - Clinic Login → PRACTICE_OWNER / PRACTICE_ADMIN of a CLINIC / MEDICAL_CENTER
   * - Doctor Login → practicing doctors (DOCTOR / SOLO) and clinic owners who
   *   also hold a doctor profile (they can run their own queue too)
   * Staff created by a clinic use Doctor Login only (not Clinic Login).
   */
  static async assertProviderPortalAccess(
    userId: string,
    portal?: string | null,
  ) {
    const normalized =
      portal === "clinic" || portal === "doctor" ? portal : null;
    if (!normalized) return;

    const memberships = await prisma.practiceMember.findMany({
      where: { userId, isActive: true },
      include: { practice: { select: { type: true } } },
    });

    const isClinicAdmin = memberships.some(
      (m) =>
        (m.role === "PRACTICE_OWNER" || m.role === "PRACTICE_ADMIN") &&
        (m.practice.type === "CLINIC" || m.practice.type === "MEDICAL_CENTER"),
    );
    const isPracticingDoctor = memberships.some(
      (m) => m.role === "DOCTOR" || m.practice.type === "SOLO",
    );

    if (normalized === "clinic") {
      if (!isClinicAdmin) {
        throw new AppError(
          403,
          "Clinic Login is for clinic owners and admins only. Doctors added by a clinic should use Doctor Login.",
        );
      }
      return;
    }

    // portal === "doctor"
    // Allow: solo / staff doctors, and clinic owners who practice.
    if (isPracticingDoctor || isClinicAdmin) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdBy: true, doctor: { select: { id: true } } },
    });
    if (user?.createdBy === "clinic_owner_signup" && !memberships.length) {
      throw new AppError(
        403,
        "Finish clinic registration, then use Clinic Login.",
      );
    }
    // Brand-new independent doctor mid-signup may have no membership yet.
    if (user?.doctor) return;

    throw new AppError(
      403,
      "No practice linked to this doctor account. Complete registration or ask your clinic to add you from their dashboard.",
    );
  }

  static async login(
    credentials: {
      email: string
      password: string
      role?: string
      portal?: string
    },
    res: Response,
  ) {
    const expectedRole = credentials.role ? normalizeAuthRole(credentials.role) : null;
    const user = await prisma.user.findUnique({
      where: { email: credentials.email },
      include: { patient: true },
    });

    if (!user) {
      ResponseHandler.notFoundError("invalid credentials!");
    }

    const decryptedPassword = unwrapPassword(credentials.password);

    if (!user!.password || !(await verifyPassword(decryptedPassword, user!.password))) {
      ResponseHandler.unauthorized("password is incorrect");
    }

    if (expectedRole && user!.role !== expectedRole) {
      const hint =
        expectedRole === "doctor"
          ? "This account is a patient account. Use Patient Login instead."
          : expectedRole === "admin"
            ? "This account is not an admin account. Use the correct portal."
            : user!.role === "doctor"
              ? "This account is a doctor account. Use Doctor Login or Clinic Login."
              : user!.role === "admin"
                ? "This account is an admin account. Use Admin Login instead."
                : "This account is a patient account. Use Patient Login instead.";
      throw new AppError(403, hint);
    }

    if (user!.role === "doctor") {
      await AuthService.assertProviderPortalAccess(
        user!.id,
        credentials.portal,
      );
    }

    const tokenResult = getUserToken(user!);
    setTokenCookies(res, tokenResult.cookies);
    const patientDob = user!.patient?.dateOfBirth ?? null;
    return res.status(200).json({
      ...tokenResult.responseBody,
      date_of_birth: patientDob,
      age: patientDob ? ageFromDob(patientDob) : null,
    });
  }

  static async googleAuth(
    credentials: { name?: string; email?: string; picture?: string },
    tag: string,
    res: Response,
  ) {
    try {
      const email = credentials.email;
      const name = credentials.name;
      const imgSrc = credentials.picture;

      if (!tag || !["gg_login", "gg_signup"].includes(tag)) {
        throw new AppError(400, `${tag} is not a valid context!`);
      }

      const user = email
        ? await prisma.user.findUnique({ where: { email } })
        : null;
      const redirectUrl = `${frontendBaseUrl}/patient/dashboard`;

      if (tag === "gg_login" && !user) {
        return res.redirect(`${frontendBaseUrl}/login?success=attempted&status=nuser`);
      }

      if (tag === "gg_login" && user) {
        const tokenResult = getUserToken(user, 200, redirectUrl);
        setTokenCookies(res, tokenResult.cookies);
        return res.redirect(tokenResult.redirect!);
      }

      if (tag === "gg_signup" && user) {
        const tokenResult = getUserToken(user, 200, redirectUrl);
        setTokenCookies(res, tokenResult.cookies);
        return res.redirect(tokenResult.redirect!);
      }

      const newUser = await prisma.user.create({
        data: {
          email: email!,
          name,
          imgSrc,
          role: "user",
          createdBy: "self_attempted",
          patient: { create: { mrn: await allocatePatientMrn() } },
        },
      });

      const tokenResult = getUserToken(newUser, 201, redirectUrl);
      setTokenCookies(res, tokenResult.cookies);
      return res.redirect(tokenResult.redirect!);
    } catch {
      return res.redirect(`${frontendBaseUrl}/login?success=attempted&status=unknown`);
    }
  }

  static buildGoogleAuthUrl(state: string): string {
    return (
      "https://accounts.google.com/o/oauth2/v2/auth" +
      "?scope=openid email profile" +
      "&access_type=offline" +
      "&response_type=code" +
      `&state=${encodeURIComponent(state)}` +
      `&redirect_uri=${encodeURIComponent(settings.googleRedirectUri)}` +
      `&client_id=${encodeURIComponent(settings.googleClientId)}`
    );
  }

  static async handleGoogleCallback(
    state: string,
    code: string | undefined,
    error: string | undefined,
    res: Response,
  ) {
    if (error) {
      ResponseHandler.unauthorized(
        `something went wrong try again - mostly ${Custom.snakeToTitle(error)}!`,
      );
    }

    const tokenResponse = await fetch("https://accounts.google.com/o/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code ?? "",
        client_id: settings.googleClientId,
        client_secret: settings.googleClientSecret,
        redirect_uri: settings.googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    const accessToken = tokenData.access_token;

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const userData = (await userInfoResponse.json()) as {
      email?: string;
      name?: string;
      picture?: string;
      verified_email?: boolean;
    };

    if (!userData.verified_email) {
      ResponseHandler.unauthorized(
        `${userData.email} is not a verified google account!`,
      );
    }

    const parsedState = JSON.parse(state) as { source?: string };
    const sourceTag = parsedState.source ?? "";

    return AuthService.googleAuth(
      {
        name: userData.name,
        email: userData.email,
        picture: userData.picture,
      },
      sourceTag,
      res,
    );
  }

  /**
   * Doctor registration with schedule setup:
   * Dr Name, license, booking type, working days/times, break, slot duration, patients/slot.
   */
  static async registerDoctor(
    input: {
      name: string;
      email: string;
      password: string;
      licenseNo: string;
      bookingType: "TOKEN" | "TIME";
      workingDays: number[];
      startTime: string;
      endTime: string;
      breakStartTime?: string;
      breakEndTime?: string;
      slotDurationMins: number;
      patientsPerSlot: number;
      appointmentValidityDays?: number;
      phone?: string;
      address?: string;
      city?: string;
      consultationFee?: number;
    },
    res: Response,
  ) {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const licenseNo = input.licenseNo.trim();
    const workingDays = Array.from(
      new Set((input.workingDays ?? []).map(Number).filter((d) => d >= 0 && d <= 6)),
    );

    if (!name || !email || !licenseNo) {
      throw new AppError(400, "Dr Name, email, and license number are required.");
    }
    if (workingDays.length === 0) {
      throw new AppError(400, "Select at least one working day.");
    }
    try {
      assertValidTimeRange(input.startTime, input.endTime, "working time");
    } catch (e) {
      throw new AppError(400, e instanceof Error ? e.message : "Invalid working time.");
    }
    const breakStart = input.breakStartTime?.trim() || "";
    const breakEnd = input.breakEndTime?.trim() || "";
    if ((breakStart && !breakEnd) || (!breakStart && breakEnd)) {
      throw new AppError(400, "Provide both break start and break end.");
    }
    if (breakStart && breakEnd) {
      try {
        assertValidTimeRange(breakStart, breakEnd, "break");
      } catch (e) {
        throw new AppError(400, e instanceof Error ? e.message : "Invalid break time.");
      }
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new AppError(409, `${email} already exists!`);

    const decryptedPassword = unwrapPassword(input.password);
    const hashedPassword = await generateHash(decryptedPassword);
    const slotMins = Math.min(120, Math.max(5, Number(input.slotDurationMins) || 15));
    const mode = input.bookingType === "TOKEN" ? "TOKEN_BASED" : "TIME_BASED";
    const patientsPerSlot =
      mode === "TIME_BASED"
        ? 1
        : Math.min(50, Math.max(1, Number(input.patientsPerSlot) || 1));
    const validity = Math.min(
      90,
      Math.max(1, Number(input.appointmentValidityDays) || 7),
    );
    const phoneRaw = input.phone?.trim() || "";
    const phoneDigits = phoneRaw.replace(/\D/g, "").slice(-10);
    if (phoneDigits.length !== 10) {
      throw new AppError(
        400,
        "A valid 10-digit mobile number is required — this becomes your WhatsApp bot line.",
      );
    }
    const phone = phoneDigits;
    const address = input.address?.trim() || "To be updated";
    const city = input.city?.trim() || "India";
    const feeRaw = Number(input.consultationFee);
    const consultationFee =
      Number.isFinite(feeRaw) && feeRaw > 0 ? feeRaw : 500;

    const hospital = await AuthService.ensureIndependentHospital();
    const availableTimes = `${workingDays.join(",")}|${input.startTime}-${input.endTime}`;

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "doctor",
        name,
        phone,
        createdBy: "self_attempted",
        doctor: {
          create: {
            description: `Independent doctor — license ${licenseNo}.`,
            hospitalId: hospital.id,
            availableTimes,
            experience: 0,
            emails: [email],
            contactNumbers: [phone],
            appointmentValidityDays: validity,
            licenseNo,
          },
        },
      },
      include: { doctor: true },
    });

    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    let slug = `dr-${baseSlug}` || `dr-${user.id.slice(0, 8)}`;
    let suffix = 1;
    while (await prisma.practice.findUnique({ where: { slug } })) {
      slug = `dr-${baseSlug}-${suffix++}`;
    }

    const practice = await prisma.practice.create({
      data: {
        name: `Dr. ${name}`,
        slug,
        type: "SOLO",
        specialty: "General",
        consultationFee,
        phone,
        email,
        registrationNo: licenseNo,
        isDirectoryListed: false,
        faqKb: {
          address: `${address}, ${city}`,
          fee: `₹${consultationFee}`,
          timings: `${workingDays.join(",")}|${input.startTime}-${input.endTime}`,
          parking: "Ask the clinic for parking details.",
          documents: "Bring a valid ID and any prior reports if you have them.",
        },
        locations: {
          create: {
            name: "Main Clinic",
            address,
            city,
          },
        },
        members: {
          create: {
            userId: user.id,
            role: "DOCTOR",
            doctorId: user.id,
          },
        },
      },
      include: { locations: true },
    });

    const locationId = practice.locations[0]!.id;
    await prisma.providerSchedule.createMany({
      data: workingDays.map((dayOfWeek) => ({
        practiceId: practice.id,
        locationId,
        providerId: user.id,
        dayOfWeek,
        mode: mode as "TIME_BASED" | "TOKEN_BASED",
        slotIntervalMin: mode === "TIME_BASED" ? slotMins : null,
        startTime: mode === "TIME_BASED" ? input.startTime : null,
        endTime: mode === "TIME_BASED" ? input.endTime : null,
        maxPerSlot: patientsPerSlot,
        sessionStart: mode === "TOKEN_BASED" ? input.startTime : null,
        sessionEnd: mode === "TOKEN_BASED" ? input.endTime : null,
        maxTokens:
          mode === "TOKEN_BASED"
            ? Math.max(
                patientsPerSlot,
                Math.floor(
                  ((minutesOf(input.endTime) - minutesOf(input.startTime)) /
                    slotMins) *
                    patientsPerSlot,
                ),
              )
            : null,
        breakStartTime: breakStart || null,
        breakEndTime: breakEnd || null,
        isActive: true,
      })),
    });

    // Independent doctors start a free trial so the dashboard is ready immediately.
    try {
      const plan = await prisma.docLinePlan.findFirst({
        where: { isActive: true },
        orderBy: { priceMonthlyInr: "asc" },
      });
      if (plan) {
        const { BillingService } = await import("./procto/billing.service.js");
        await BillingService.selectPlan(practice.id, plan.id, user.id, "trial");
      }
    } catch {
      // Practice + schedules already exist; subscription can be finished later.
    }

    // Auto-add registration Tel to Meta WABA phone list (+ GlucoGuide number pool).
    void import("./procto/metaWhatsApp.service.js")
      .then(({ MetaWhatsAppService }) =>
        MetaWhatsAppService.ensurePhoneListedAtRegistration({
          practiceId: practice.id,
          phoneNumber: phone,
          displayName: practice.name,
        }),
      )
      .then((r) => {
        if (r.ok) {
          console.log(
            `[Meta] doctor registration phone ${phone} → ${r.mode}` +
              (r.phoneNumberId ? ` id=${r.phoneNumberId}` : ""),
          );
        } else {
          console.warn(
            `[Meta] doctor registration phone ${phone} deferred: ${r.message}`,
          );
        }
      })
      .catch((err) =>
        console.warn(
          "[Meta] doctor registration phone provision failed:",
          err instanceof Error ? err.message : err,
        ),
      );

    const sessionUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      password: user.password,
    };
    const tokenResult = getUserToken(sessionUser, 201);
    setTokenCookies(res, tokenResult.cookies);
    return res.status(201).json({
      ...tokenResult.responseBody,
      practiceId: practice.id,
      practiceSlug: practice.slug,
      practiceType: "SOLO",
    });
  }
}
