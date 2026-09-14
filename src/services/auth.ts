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
      appointmentValidityDays?: number
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
          createdBy: "self_attempted",
          doctor: {
            create: {
              description: "Newly registered doctor — complete your practice profile.",
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
      user = await prisma.user.create({
        data: {
          email: credentials.email,
          password: hashedPassword,
          role: "user",
          name: credentials.name?.trim() || null,
          phone,
          gender,
          createdBy: "self_attempted",
          patient: { create: {} },
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
    return res.status(201).json(tokenResult.responseBody);
  }

  static async login(
    credentials: { email: string; password: string; role?: string },
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
              ? "This account is a doctor account. Use Doctor Login instead."
              : user!.role === "admin"
                ? "This account is an admin account. Use Admin Login instead."
                : "This account is a patient account. Use Patient Login instead.";
      throw new AppError(403, hint);
    }

    const tokenResult = getUserToken(user!);
    setTokenCookies(res, tokenResult.cookies);
    return res.status(200).json({
      ...tokenResult.responseBody,
      date_of_birth: user!.patient?.dateOfBirth ?? null,
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
          patient: { create: {} },
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
    const patientsPerSlot = Math.min(50, Math.max(1, Number(input.patientsPerSlot) || 1));
    const validity = Math.min(
      90,
      Math.max(1, Number(input.appointmentValidityDays) || 7),
    );
    const mode = input.bookingType === "TOKEN" ? "TOKEN_BASED" : "TIME_BASED";
    const phone = input.phone?.trim() || null;

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
            contactNumbers: phone ? [phone] : [],
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
        phone,
        email,
        registrationNo: licenseNo,
        locations: {
          create: {
            name: "Main Clinic",
            address: "To be updated",
            city: "India",
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
    });
  }
}
