import { prisma } from "../../db/prisma.js";
import { AppError, ResponseHandler } from "../../core/response.js";
import { generateHash } from "../../core/security.js";
import { isUuid } from "../../core/params.js";
import type { PracticeType, PracticeMemberRole } from "@prisma/client";
import { BookingStatus, ScheduleMode, OverrideType } from "@prisma/client";
import { AuthService } from "../auth.js";
import {
  assertValidTimeRange,
  endOfLocalDay,
  getTokenSession,
  minutesOf,
  parseLocalDate,
  resolveProviderBookingMode,
  schedulesForActiveMode,
  startOfLocalDay,
  timeSlotsForProviderDay,
} from "./slotEngine.js";
import { last10Digits, normalizeGender } from "../../core/gender.js";

function emptyGenderCounts() {
  return { male: 0, female: 0, others: 0, unknown: 0 };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

type OnboardDoctorInput = {
  name: string;
  email: string;
  phone?: string;
  specialty?: string;
  appointmentValidityDays?: number;
};

const LIST_PUBLIC_TTL_MS = 45_000;
const listPublicCache = new Map<
  string,
  { at: number; data: Array<Record<string, unknown>> }
>();

export const PracticeService = {
  async onboardPractice(data: {
    name: string;
    type?: PracticeType;
    specialty?: string;
    consultationFee?: number;
    ownerUserId: string;
    location: { name: string; address: string; city: string };
    whatsappBusinessNumber?: string;
    registrationNo?: string;
    phone?: string;
    email?: string;
    appointmentValidityDays?: number;
    doctorName?: string;
    doctors?: OnboardDoctorInput[];
    /** Clinic cover / profile image URL (S3 or CDN). */
    bgSrc?: string;
    photoUrl?: string;
    faqKb?: Record<string, string>;
  }) {
    const consultationFee = Number(data.consultationFee);
    if (!Number.isFinite(consultationFee) || consultationFee <= 0) {
      throw new AppError(
        400,
        "Appointment / consultation fee (₹) is required and must be greater than 0.",
      );
    }

    const doctors = (data.doctors ?? []).filter(
      (d) => d.name?.trim() && d.email?.trim(),
    );
    if (doctors.length > 0) {
      throw new AppError(
        403,
        "Multi-doctor clinics require Growth or Clinic. Create the practice first, subscribe under Billing, then add doctors.",
      );
    }
    const practiceType: PracticeType =
      data.type ??
      (doctors.length > 0 ? "CLINIC" : "SOLO");

    const baseSlug = slugify(data.name);
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.practice.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    if (data.phone || data.doctorName) {
      await prisma.user
        .update({
          where: { id: data.ownerUserId },
          data: {
            ...(data.doctorName?.trim()
              ? { name: data.doctorName.trim() }
              : {}),
            ...(data.phone ? { phone: data.phone.trim() } : {}),
          },
        })
        .catch(() => undefined);

      await prisma.doctor
        .update({
          where: { id: data.ownerUserId },
          data: {
            ...(data.phone ? { contactNumbers: [data.phone.trim()] } : {}),
            ...(data.appointmentValidityDays != null
              ? {
                  appointmentValidityDays: Math.min(
                    90,
                    Math.max(1, Number(data.appointmentValidityDays) || 7),
                  ),
                }
              : {}),
          },
        })
        .catch(() => undefined);
    }

    const hospital = await AuthService.ensureIndependentHospital();
    const createdDoctorMembers: {
      userId: string;
      role: PracticeMemberRole;
      doctorId: string;
    }[] = [];

    for (const doc of doctors) {
      const email = doc.email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        // Link existing doctor account to this practice if possible
        if (existing.role === "doctor") {
          createdDoctorMembers.push({
            userId: existing.id,
            role: "DOCTOR",
            doctorId: existing.id,
          });
        }
        continue;
      }

      const validity = Math.min(
        90,
        Math.max(1, Number(doc.appointmentValidityDays) || 7),
      );
      const tempPassword = await generateHash("Doctor@Temp1");
      const user = await prisma.user.create({
        data: {
          email,
          password: tempPassword,
          role: "doctor",
          name: doc.name.trim(),
          phone: doc.phone?.trim() || null,
          createdBy: "clinic_onboard",
          doctor: {
            create: {
              description: doc.specialty?.trim()
                ? `${doc.specialty.trim()} — clinic staff doctor.`
                : "Clinic staff doctor — complete your profile.",
              hospitalId: hospital.id,
              availableTimes: "Mon–Fri 09:00–17:00",
              experience: 0,
              emails: [email],
              contactNumbers: doc.phone?.trim() ? [doc.phone.trim()] : [],
              appointmentValidityDays: validity,
            },
          },
        },
      });
      createdDoctorMembers.push({
        userId: user.id,
        role: "DOCTOR",
        doctorId: user.id,
      });
    }

    const ownerRole: PracticeMemberRole =
      practiceType === "SOLO" && createdDoctorMembers.length === 0
        ? "DOCTOR"
        : "PRACTICE_OWNER";

    const waDigits = data.whatsappBusinessNumber
      ? data.whatsappBusinessNumber.replace(/\D/g, "").slice(-10)
      : "";
    const phoneDigits = data.phone
      ? data.phone.replace(/\D/g, "").slice(-10)
      : "";
    // Until a pool line is LIVE, Tel and optional WA hint stay aligned.
    const publicPhone = phoneDigits || waDigits || null;

    return prisma.practice.create({
      data: {
        name: data.name,
        slug,
        type: practiceType,
        specialty: data.specialty,
        consultationFee,
        whatsappBusinessNumber: waDigits || publicPhone,
        registrationNo: data.registrationNo?.trim() || null,
        phone: publicPhone,
        email: data.email?.trim() || null,
        bgSrc: (data.bgSrc ?? data.photoUrl)?.trim() || null,
        isDirectoryListed: false,
        faqKb: data.faqKb ?? {
          address: `${data.location.address}, ${data.location.city}`,
          fee: `₹${consultationFee}`,
          timings: "See schedule on the clinic profile or ask for available slots.",
          parking: "Ask the clinic for parking details.",
          documents: "Bring a valid ID and any prior reports if you have them.",
        },
        locations: {
          create: {
            name: data.location.name,
            address: data.location.address,
            city: data.location.city,
          },
        },
        members: {
          create: [
            {
              userId: data.ownerUserId,
              role: ownerRole,
              doctorId: ownerRole === "DOCTOR" ? data.ownerUserId : undefined,
            },
            ...createdDoctorMembers.map((m) => ({
              userId: m.userId,
              role: m.role,
              doctorId: m.doctorId,
            })),
          ],
        },
      },
      include: {
        locations: true,
        members: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });
  },

  async listPublic(filters?: { specialty?: string; city?: string; q?: string }) {
    const cacheKey = JSON.stringify({
      specialty: filters?.specialty ?? "",
      city: filters?.city ?? "",
      q: filters?.q ?? "",
    });
    const cached = listPublicCache.get(cacheKey);
    if (cached && Date.now() - cached.at < LIST_PUBLIC_TTL_MS) {
      return cached.data;
    }

    const where: Record<string, unknown> = {
      isActive: true,
      isDirectoryListed: true,
    };
    if (filters?.specialty) where.specialty = { contains: filters.specialty, mode: "insensitive" };
    if (filters?.q) {
      where.OR = [
        { name: { contains: filters.q, mode: "insensitive" } },
        { specialty: { contains: filters.q, mode: "insensitive" } },
      ];
    }
    if (filters?.city?.trim()) {
      where.locations = {
        some: {
          city: { contains: filters.city.trim(), mode: "insensitive" },
          isActive: true,
        },
      };
    }

    // Slim select — directory cards only need name/photo/location/members/plan flags.
    const rows = await prisma.practice.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        specialty: true,
        consultationFee: true,
        bgSrc: true,
        phone: true,
        email: true,
        locations: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
          },
        },
        members: {
          where: { role: { in: ["DOCTOR", "PRACTICE_OWNER"] }, isActive: true },
          select: {
            userId: true,
            role: true,
            user: { select: { id: true, name: true, imgSrc: true } },
          },
        },
        subscription: {
          select: {
            status: true,
            plan: { select: { name: true, features: true } },
          },
        },
        _count: {
          select: { schedules: { where: { isActive: true } } },
        },
      },
      orderBy: { name: "asc" },
      take: 100,
    });

    const { hasFeatureFlag, isSubscriptionUsable } = await import(
      "./planEntitlements.js"
    );

    const ranked = rows
      .map((p) => {
        const usable = isSubscriptionUsable(p.subscription?.status);
        const features = usable
          ? ((p.subscription?.plan?.features ?? {}) as Record<string, unknown>)
          : {};
        const priority = hasFeatureFlag(features, "priorityListing");
        const reviewsEnabled =
          usable && hasFeatureFlag(features, "reviews");
        const { subscription: _sub, _count, ...rest } = p;
        return {
          ...rest,
          featured: priority,
          planName: usable ? p.subscription?.plan?.name ?? null : null,
          nextAvailableHint:
            _count.schedules > 0 ? "Available to book" : null,
          reviewsEnabled,
          _rank: priority ? 1 : 0,
        };
      })
      .sort((a, b) => {
        if (b._rank !== a._rank) return b._rank - a._rank;
        return a.name.localeCompare(b.name);
      })
      .map(({ _rank, reviewsEnabled, ...rest }) => ({
        ...rest,
        reviewsEnabled,
      }));

    const { ReviewService } = await import("./review.service.js");
    const reviewPracticeIds = ranked
      .filter((p) => p.reviewsEnabled)
      .map((p) => p.id);
    const reviewSummaries =
      await ReviewService.summariesForPractices(reviewPracticeIds);

    const data = ranked.map(({ reviewsEnabled, ...rest }) => ({
      ...rest,
      reviewSummary: reviewsEnabled
        ? reviewSummaries.get(rest.id) ?? { average: null, count: 0 }
        : { average: null, count: 0 },
    }));

    listPublicCache.set(cacheKey, {
      at: Date.now(),
      data: data as Array<Record<string, unknown>>,
    });
    return data;
  },

  async getBySlug(slug: string) {
    const practice = await prisma.practice.findUnique({
      where: { slug },
      include: {
        locations: { where: { isActive: true } },
        members: {
          where: { isActive: true },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                imgSrc: true,
                email: true,
                doctor: {
                  select: {
                    licenseNo: true,
                    appointmentValidityDays: true,
                  },
                },
              },
            },
          },
        },
        schedules: {
          where: { isActive: true },
          select: {
            mode: true,
            dayOfWeek: true,
            providerId: true,
          },
        },
        reviews: {
          where: { isPublished: true },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            authorName: true,
            rating: true,
            providerRating: true,
            body: true,
            createdAt: true,
          },
        },
        subscription: {
          select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
        },
      },
    });
    if (!practice) ResponseHandler.notFoundError("practice not found.");

    // Public directory profile — unlisted clinics are not reachable by slug
    if (!practice!.isActive || !practice!.isDirectoryListed) {
      ResponseHandler.notFoundError("practice not found.");
    }

    const { hasFeatureFlag, isSubscriptionUsable } = await import(
      "./planEntitlements.js"
    );
    const usable = isSubscriptionUsable(practice!.subscription?.status);
    // Reviews only when Growth/Clinic feature is on (subscription include may lack features JSON)
    const subFull = await prisma.practiceSubscription.findUnique({
      where: { practiceId: practice!.id },
      include: { plan: true },
    });
    const features = usable
      ? ((subFull?.plan?.features ?? {}) as Record<string, unknown>)
      : {};
    const reviewsEnabled = hasFeatureFlag(features, "reviews");
    const reviews = reviewsEnabled ? practice!.reviews : [];
    const ratings = reviews.map((r) => r.rating);
    const reviewSummary = {
      average: ratings.length
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null,
      count: ratings.length,
    };
    return {
      ...practice!,
      reviews,
      reviewSummary,
      reviewsEnabled,
      featured: hasFeatureFlag(features, "priorityListing"),
      planName: usable ? subFull?.plan?.name ?? null : null,
    };
  },

  async listConversations(practiceId: string, actorUserId: string) {
    await this.assertMember(practiceId, actorUserId);
    return prisma.whatsAppConversation.findMany({
      where: { practiceId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        patientPhone: true,
        status: true,
        updatedAt: true,
        state: true,
      },
    });
  },

  async setConversationStatus(
    practiceId: string,
    conversationId: string,
    status: "bot_active" | "handed_off" | "closed",
    actorUserId: string,
  ) {
    await this.assertMember(practiceId, actorUserId);
    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, practiceId },
    });
    if (!conv) ResponseHandler.notFoundError("conversation not found.");
    const prev = (conv!.state as Record<string, unknown>) ?? {};
    const handedOff = status === "handed_off";
    const updated = await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        status,
        state: {
          ...prev,
          handedOff,
          ...(status === "bot_active" ? { handedOff: false } : {}),
        },
      },
    });
    const { broadcastProctoEvent } = await import("./proctoSocket.js");
    void broadcastProctoEvent(practiceId, {
      event: "conversation_updated",
      conversation: {
        id: updated.id,
        practice_id: updated.practiceId,
        status: updated.status,
        patient_phone: updated.patientPhone,
        updated_at: updated.updatedAt.toISOString(),
      },
    }).catch(() => undefined);
    return updated;
  },

  async assertMember(practiceId: string, userId: string) {
    const member = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId, userId } },
    });
    if (!member?.isActive) ResponseHandler.noPermission("not a member of this practice.");
    return member!;
  },

  async assertAdmin(practiceId: string, userId: string) {
    const member = await this.assertMember(practiceId, userId);
    if (
      member.role !== "PRACTICE_OWNER" &&
      member.role !== "PRACTICE_ADMIN"
    ) {
      ResponseHandler.noPermission("only clinic owners can manage doctors and patients.");
    }
    return member;
  },

  async addMember(
    practiceId: string,
    data: { userId: string; role: PracticeMemberRole; doctorId?: string },
    actorUserId: string,
  ) {
    await this.assertAdmin(practiceId, actorUserId);
    if (data.role === "DOCTOR" || data.role === "PRACTICE_OWNER") {
      const { assertCanAddDoctor } = await import("./planEntitlements.js");
      await assertCanAddDoctor(practiceId);
    }
    return prisma.practiceMember.create({
      data: {
        practiceId,
        userId: data.userId,
        role: data.role,
        doctorId: data.doctorId,
      },
    });
  },

  /**
   * Create or link a doctor account and add them to the clinic roster.
   */
  async createDoctor(
    practiceId: string,
    data: {
      name: string;
      email: string;
      phone?: string;
      specialty?: string;
      licenseNo?: string;
      appointmentValidityDays?: number;
      password?: string;
    },
    actorUserId: string,
  ) {
    await this.assertAdmin(practiceId, actorUserId);

    const { assertCanAddDoctor } = await import("./planEntitlements.js");
    await assertCanAddDoctor(practiceId);

    const name = data.name?.trim();
    const email = data.email?.trim().toLowerCase();
    if (!name || !email) {
      throw new AppError(400, "Doctor name and email are required.");
    }

    const hospital = await AuthService.ensureIndependentHospital();
    const validity = Math.min(
      90,
      Math.max(1, Number(data.appointmentValidityDays) || 7),
    );

    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      if (user.role !== "doctor") {
        throw new AppError(400, "That email belongs to a non-doctor account.");
      }
      const existingMember = await prisma.practiceMember.findUnique({
        where: { practiceId_userId: { practiceId, userId: user.id } },
      });
      if (existingMember?.isActive) {
        throw new AppError(400, "Doctor is already on this clinic roster.");
      }
      // Optional: update password when linking if provided
      if (data.password?.trim()) {
        if (data.password.trim().length < 6) {
          throw new AppError(400, "Password must be at least 6 characters.");
        }
        await prisma.user.update({
          where: { id: user.id },
          data: { password: await generateHash(data.password.trim()) },
        });
      }
      if (!(await prisma.doctor.findUnique({ where: { id: user.id } }))) {
        await prisma.doctor.create({
          data: {
            id: user.id,
            description: data.specialty?.trim()
              ? `${data.specialty.trim()} — clinic staff doctor.`
              : "Clinic staff doctor.",
            hospitalId: hospital.id,
            availableTimes: "Mon–Fri 09:00–17:00",
            experience: 0,
            emails: [email],
            contactNumbers: data.phone?.trim() ? [data.phone.trim()] : [],
            appointmentValidityDays: validity,
            licenseNo: data.licenseNo?.trim() || null,
          },
        });
      }
      const member = existingMember
        ? await prisma.practiceMember.update({
            where: { id: existingMember.id },
            data: { isActive: true, role: "DOCTOR", doctorId: user.id },
          })
        : await prisma.practiceMember.create({
            data: {
              practiceId,
              userId: user.id,
              role: "DOCTOR",
              doctorId: user.id,
            },
          });
      return {
        member,
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
        temporaryPassword: null as string | null,
      };
    }

    const plainPassword = data.password?.trim();
    if (!plainPassword || plainPassword.length < 6) {
      throw new AppError(
        400,
        "Password is required for new doctor login (min 6 characters).",
      );
    }
    const hashed = await generateHash(plainPassword);
    user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        role: "doctor",
        name,
        phone: data.phone?.trim() || null,
        createdBy: "clinic_doctor_add",
        doctor: {
          create: {
            description: data.specialty?.trim()
              ? `${data.specialty.trim()} — clinic staff doctor.`
              : "Clinic staff doctor — complete your profile.",
            hospitalId: hospital.id,
            availableTimes: "Mon–Fri 09:00–17:00",
            experience: 0,
            emails: [email],
            contactNumbers: data.phone?.trim() ? [data.phone.trim()] : [],
            appointmentValidityDays: validity,
            licenseNo: data.licenseNo?.trim() || null,
          },
        },
      },
    });

    const member = await prisma.practiceMember.create({
      data: {
        practiceId,
        userId: user.id,
        role: "DOCTOR",
        doctorId: user.id,
      },
    });

    return {
      member,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
      temporaryPassword: null as string | null,
    };
  },

  async setMemberActive(
    practiceId: string,
    memberUserId: string,
    isActive: boolean,
    actorUserId: string,
  ) {
    await this.assertAdmin(practiceId, actorUserId);
    if (memberUserId === actorUserId) {
      throw new AppError(400, "You cannot deactivate your own clinic membership.");
    }
    const member = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId, userId: memberUserId } },
    });
    if (!member) ResponseHandler.notFoundError("member not found.");
    if (member!.role === "PRACTICE_OWNER" && !isActive) {
      throw new AppError(400, "Cannot deactivate the clinic owner.");
    }
    if (
      isActive &&
      !member!.isActive &&
      (member!.role === "DOCTOR" || member!.role === "PRACTICE_OWNER")
    ) {
      const { assertCanAddDoctor } = await import("./planEntitlements.js");
      await assertCanAddDoctor(practiceId);
    }
    return prisma.practiceMember.update({
      where: { id: member!.id },
      data: { isActive },
    });
  },

  /**
   * Distinct patients from practice bookings, with recent visit summary.
   */
  async listPatients(practiceId: string, actorUserId: string) {
    await this.assertMember(practiceId, actorUserId);

    const bookings = await prisma.practiceBooking.findMany({
      where: { practiceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        patientPhone: true,
        patientName: true,
        patientId: true,
        status: true,
        mode: true,
        channel: true,
        slotStart: true,
        sessionDate: true,
        tokenNumber: true,
        providerId: true,
        notes: true,
        consultationType: true,
        disease: true,
        doctorRemarks: true,
        medicines: true,
        documents: true,
        createdAt: true,
      },
    });

    const byPhone = new Map<
      string,
      {
        phone: string;
        name: string | null;
        patientId: string | null;
        bookingCount: number;
        lastVisitAt: Date | null;
        lastStatus: string | null;
        providers: Set<string>;
        recent: typeof bookings;
      }
    >();

    for (const b of bookings) {
      const phone = b.patientPhone;
      let row = byPhone.get(phone);
      if (!row) {
        row = {
          phone,
          name: b.patientName,
          patientId: b.patientId,
          bookingCount: 0,
          lastVisitAt: null,
          lastStatus: null,
          providers: new Set(),
          recent: [],
        };
        byPhone.set(phone, row);
      }
      row.bookingCount += 1;
      row.providers.add(b.providerId);
      if (b.patientName && !row.name) row.name = b.patientName;
      if (b.patientId && !row.patientId) row.patientId = b.patientId;
      if (row.recent.length < 8) row.recent.push(b);
      const visitAt = b.slotStart ?? b.sessionDate ?? b.createdAt;
      if (!row.lastVisitAt || visitAt > row.lastVisitAt) {
        row.lastVisitAt = visitAt;
        row.lastStatus = b.status;
      }
    }

    const providerIds = [...new Set(bookings.map((b) => b.providerId))];
    const patientIds = [
      ...new Set(
        bookings.map((b) => b.patientId).filter((id): id is string => !!id),
      ),
    ];
    const phones = [...new Set(bookings.map((b) => b.patientPhone))];

    const [providers, patientsById, usersByPhone] = await Promise.all([
      providerIds.length
        ? prisma.user.findMany({
            where: { id: { in: providerIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      patientIds.length
        ? prisma.user.findMany({
            where: { id: { in: patientIds } },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              gender: true,
              address: true,
              patient: {
                select: {
                  profession: true,
                  dateOfBirth: true,
                  contactNumber: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      phones.length
        ? prisma.user.findMany({
            where: {
              OR: [
                { phone: { in: phones } },
                { patient: { contactNumber: { in: phones } } },
              ],
              role: "user",
            },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              gender: true,
              address: true,
              patient: {
                select: {
                  profession: true,
                  dateOfBirth: true,
                  contactNumber: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const providerName = Object.fromEntries(providers.map((p) => [p.id, p.name]));
    const patientById = Object.fromEntries(patientsById.map((p) => [p.id, p]));
    const patientByPhone = new Map<string, (typeof usersByPhone)[number]>();
    for (const u of usersByPhone) {
      if (u.phone) patientByPhone.set(u.phone, u);
      if (u.patient?.contactNumber) {
        patientByPhone.set(u.patient.contactNumber, u);
      }
    }

    return [...byPhone.values()]
      .sort((a, b) => (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0))
      .map((row) => {
        const linked =
          (row.patientId ? patientById[row.patientId] : undefined) ??
          patientByPhone.get(row.phone) ??
          null;

        return {
          phone: row.phone,
          name: linked?.name ?? row.name,
          patientId: linked?.id ?? row.patientId,
          email: linked?.email ?? null,
          gender: linked?.gender ?? null,
          address: linked?.address ?? null,
          profession: linked?.patient?.profession ?? null,
          dateOfBirth: linked?.patient?.dateOfBirth ?? null,
          bookingCount: row.bookingCount,
          lastVisitAt: row.lastVisitAt,
          lastStatus: row.lastStatus,
          providerNames: [...row.providers]
            .map((id) => providerName[id] || "Doctor")
            .filter(Boolean),
          recentBookings: row.recent.map((b) => ({
            id: b.id,
            status: b.status,
            mode: b.mode,
            channel: b.channel,
            slotStart: b.slotStart,
            sessionDate: b.sessionDate,
            tokenNumber: b.tokenNumber,
            providerId: b.providerId,
            providerName: providerName[b.providerId] ?? null,
            notes: b.notes,
            consultationType: b.consultationType,
            disease: b.disease,
            doctorRemarks: b.doctorRemarks,
            medicines: b.medicines,
            documents: b.documents,
            createdAt: b.createdAt,
          })),
        };
      });
  },

  async upsertSchedule(
    practiceId: string,
    providerId: string,
    data: {
      locationId: string;
      dayOfWeek: number;
      mode: ScheduleMode;
      slotIntervalMin?: number;
      startTime?: string;
      endTime?: string;
      maxPerSlot?: number;
      sessionStart?: string;
      sessionEnd?: string;
      maxTokens?: number;
      breakStartTime?: string | null;
      breakEndTime?: string | null;
    },
    actorUserId: string,
  ) {
    await this.assertMember(practiceId, actorUserId);

    // Only one booking mode (time OR token) per provider at a location.
    await prisma.providerSchedule.deleteMany({
      where: {
        practiceId,
        providerId,
        locationId: data.locationId,
        mode: { not: data.mode },
      },
    });

    const existing = await prisma.providerSchedule.findFirst({
      where: { practiceId, providerId, locationId: data.locationId, dayOfWeek: data.dayOfWeek },
    });

    const isTime = data.mode === ScheduleMode.TIME_BASED;

    const payload = {
      practiceId,
      providerId,
      locationId: data.locationId,
      dayOfWeek: data.dayOfWeek,
      mode: data.mode,
      slotIntervalMin: isTime ? (data.slotIntervalMin ?? 15) : null,
      startTime: isTime ? (data.startTime ?? null) : null,
      endTime: isTime ? (data.endTime ?? null) : null,
      maxPerSlot: data.maxPerSlot ?? 1,
      sessionStart: !isTime ? (data.sessionStart ?? null) : null,
      sessionEnd: !isTime ? (data.sessionEnd ?? null) : null,
      maxTokens: !isTime ? (data.maxTokens ?? null) : null,
      breakStartTime: data.breakStartTime ?? null,
      breakEndTime: data.breakEndTime ?? null,
      isActive: true,
    };

    if (existing) {
      return prisma.providerSchedule.update({ where: { id: existing.id }, data: payload });
    }
    return prisma.providerSchedule.create({ data: payload });
  },

  async createOverride(
    practiceId: string,
    providerId: string,
    data: {
      date: string;
      type: string;
      startTime?: string;
      endTime?: string;
      maxTokens?: number;
      reason?: string;
    },
    actorUserId: string,
  ) {
    const overrideType = data.type as OverrideType;

    if (overrideType === OverrideType.EXTRA_SLOT) {
      await this.assertAdmin(practiceId, actorUserId);
      if (!data.startTime || !data.endTime) {
        throw new AppError(400, "Start and end time are required for extra slots.");
      }
      try {
        assertValidTimeRange(data.startTime, data.endTime, "extra slot window");
      } catch (e) {
        throw new AppError(400, e instanceof Error ? e.message : "Invalid extra slot window.");
      }
      const schedules = await prisma.providerSchedule.findMany({
        where: { practiceId, providerId, isActive: true },
      });
      if (resolveProviderBookingMode(schedules) !== ScheduleMode.TIME_BASED) {
        throw new AppError(400, "Extra slots are only available for time-based booking.");
      }
    } else {
      await this.assertMember(practiceId, actorUserId);
    }

    const dayStart = startOfLocalDay(parseLocalDate(data.date));
    const dayEnd = endOfLocalDay(dayStart);

    const override = await prisma.scheduleOverride.create({
      data: {
        practiceId,
        providerId,
        date: dayStart,
        type: overrideType,
        startTime: data.startTime,
        endTime: data.endTime,
        maxTokens: data.maxTokens,
        reason: data.reason,
      },
    });

    const affected = await prisma.practiceBooking.findMany({
      where: {
        practiceId,
        providerId,
        status: BookingStatus.SCHEDULED,
        OR: [
          { sessionDate: dayStart },
          { slotStart: { gte: dayStart, lte: dayEnd } },
        ],
      },
      take: 100,
    });

    const { NotificationService } = await import("./notification.service.js");
    for (const booking of affected) {
      if (data.type === "BLOCK_SLOT" && data.startTime && booking.slotStart) {
        const hh = String(booking.slotStart.getHours()).padStart(2, "0");
        const mm = String(booking.slotStart.getMinutes()).padStart(2, "0");
        const slotHm = `${hh}:${mm}`;
        if (slotHm < data.startTime || (data.endTime && slotHm >= data.endTime)) {
          continue;
        }
      }
      void NotificationService.enqueueOverrideImpact(
        booking.id,
        data.reason ?? `${data.type} on ${data.date}`,
      ).catch(() => undefined);
    }

    return override;
  },

  async getSchedules(practiceId: string, providerId?: string, actorUserId?: string) {
    if (actorUserId) await this.assertMember(practiceId, actorUserId);
    return prisma.providerSchedule.findMany({
      where: { practiceId, ...(providerId ? { providerId } : {}), isActive: true },
      include: { location: true },
    });
  },

  async getOverrides(
    practiceId: string,
    providerId?: string,
    date?: string,
    actorUserId?: string,
  ) {
    if (actorUserId) await this.assertMember(practiceId, actorUserId);
    return prisma.scheduleOverride.findMany({
      where: {
        practiceId,
        ...(providerId ? { providerId } : {}),
        ...(date ? { date: startOfLocalDay(parseLocalDate(date)) } : {}),
      },
      orderBy: { date: "desc" },
    });
  },

  async updatePractice(
    practiceId: string,
    data: {
      name?: string;
      specialty?: string;
      consultationFee?: number;
      whatsappBusinessNumber?: string;
      registrationNo?: string;
      phone?: string;
      email?: string;
      bgSrc?: string | null;
      location?: {
        id?: string;
        name?: string;
        address?: string;
        city?: string;
      };
    },
    actorUserId: string,
  ) {
    await this.assertMember(practiceId, actorUserId);
    if (data.bgSrc !== undefined) {
      await this.assertAdmin(practiceId, actorUserId);
    }

    let nextConsultationFee: number | undefined;
    if (data.consultationFee !== undefined) {
      const fee = Number(data.consultationFee);
      if (!Number.isFinite(fee) || fee <= 0) {
        throw new AppError(
          400,
          "Appointment / consultation fee (₹) is required and must be greater than 0.",
        );
      }
      nextConsultationFee = fee;
    }

    const liveLine = await prisma.whatsAppNumber.findFirst({
      where: {
        practiceId,
        status: {
          in: [
            "LIVE",
            "TEMPLATES_PENDING",
            "DISPLAY_NAME_PENDING",
            "VERIFYING",
            "ASSIGNED",
          ],
        },
      },
      select: { phoneNumber: true, status: true },
    });

    // Profile Tel = WhatsApp bot number when a line is connected.
    // Clients cannot freestyle whatsappBusinessNumber — pool/connect owns it.
    if (data.whatsappBusinessNumber !== undefined) {
      if (liveLine) {
        data.whatsappBusinessNumber = liveLine.phoneNumber;
      } else {
        // Ignore free-text WA field unless connecting via NumberPool
        delete data.whatsappBusinessNumber;
      }
    }
    if (liveLine && data.phone !== undefined) {
      const incoming = data.phone.replace(/\D/g, "").slice(-10);
      if (incoming && incoming !== liveLine.phoneNumber) {
        throw new AppError(
          400,
          `Clinic Tel is locked to your WhatsApp booking number (${liveLine.phoneNumber}). Change the line under Billing → WhatsApp, or contact support.`,
        );
      }
      data.phone = liveLine.phoneNumber;
    }

    return prisma.$transaction(async (tx) => {
      const existing = await tx.practice.findUnique({
        where: { id: practiceId },
        select: { faqKb: true },
      });
      const faqKb: Record<string, string> = {
        ...((existing?.faqKb &&
        typeof existing.faqKb === "object" &&
        !Array.isArray(existing.faqKb)
          ? (existing.faqKb as Record<string, string>)
          : {}) ?? {}),
      };
      let faqDirty = false;
      if (nextConsultationFee !== undefined) {
        faqKb.fee = `₹${nextConsultationFee}`;
        faqDirty = true;
      }

      const practice = await tx.practice.update({
        where: { id: practiceId },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.specialty !== undefined ? { specialty: data.specialty } : {}),
          ...(nextConsultationFee !== undefined
            ? { consultationFee: nextConsultationFee }
            : {}),
          ...(data.whatsappBusinessNumber !== undefined
            ? { whatsappBusinessNumber: data.whatsappBusinessNumber }
            : {}),
          ...(data.registrationNo !== undefined
            ? { registrationNo: data.registrationNo.trim() || null }
            : {}),
          ...(data.phone !== undefined
            ? { phone: data.phone.trim() || null }
            : liveLine
              ? { phone: liveLine.phoneNumber, whatsappBusinessNumber: liveLine.phoneNumber }
              : {}),
          ...(data.email !== undefined
            ? { email: data.email.trim().toLowerCase() || null }
            : {}),
          ...(data.bgSrc !== undefined
            ? {
                bgSrc:
                  data.bgSrc == null || !String(data.bgSrc).trim()
                    ? null
                    : String(data.bgSrc).trim(),
              }
            : {}),
          ...(faqDirty ? { faqKb } : {}),
        },
      });

      if (data.location) {
        const loc =
          (data.location.id
            ? await tx.clinicLocation.findFirst({
                where: { id: data.location.id, practiceId },
              })
            : null) ??
          (await tx.clinicLocation.findFirst({
            where: { practiceId, isActive: true },
            orderBy: { createdAt: "asc" },
          }));

        if (loc) {
          const cityGuess =
            data.location.city?.trim() ||
            data.location.address
              ?.split(",")
              .map((p) => p.trim())
              .filter(Boolean)
              .at(-1) ||
            loc.city;

          await tx.clinicLocation.update({
            where: { id: loc.id },
            data: {
              ...(data.location.name !== undefined
                ? { name: data.location.name.trim() || loc.name }
                : {}),
              ...(data.location.address !== undefined
                ? { address: data.location.address.trim() }
                : {}),
              city: cityGuess,
            },
          });

          if (data.location.address !== undefined) {
            faqKb.address = `${data.location.address.trim()}, ${cityGuess}`;
            await tx.practice.update({
              where: { id: practiceId },
              data: { faqKb },
            });
          }
        }
      }

      // Keep clinic owner contact in sync when they edit practice phone
      if (data.phone !== undefined) {
        await tx.user
          .update({
            where: { id: actorUserId },
            data: { phone: data.phone.trim() || null },
          })
          .catch(() => undefined);
      }

      return tx.practice.findUniqueOrThrow({
        where: { id: practice.id },
        include: {
          locations: { where: { isActive: true } },
          members: {
            where: { isActive: true },
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      });
    });
  },

  async getForUser(userId: string) {
    const rows = await prisma.practiceMember.findMany({
      where: { userId, isActive: true },
      include: {
        practice: {
          include: {
            locations: { where: { isActive: true } },
            members: {
              where: { isActive: true },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    doctor: {
                      select: {
                        licenseNo: true,
                        appointmentValidityDays: true,
                        description: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Normalize shape: top-level `id` is the practice UUID (what booking/billing
    // routes expect). Membership PK is exposed as `membershipId` so clients
    // never pass the wrong id into /bookings/practice/:practiceId.
    return rows.map((row) => ({
      ...row,
      membershipId: row.id,
      id: row.practiceId,
      practiceId: row.practiceId,
    }));
  },

  /**
   * Sync doctor profile + weekly schedule in one transaction (batch write).
   */
  async syncProviderSettings(
    practiceId: string,
    providerId: string,
    data: {
      locationId: string;
      name?: string;
      licenseNo?: string;
      appointmentValidityDays?: number;
      bookingType: "TIME" | "TOKEN" | "TIME_BASED" | "TOKEN_BASED";
      workingDays: number[];
      startTime: string;
      endTime: string;
      breakStartTime?: string;
      breakEndTime?: string;
      slotDurationMins?: number;
      patientsPerSlot?: number;
    },
    actorUserId: string,
  ) {
    await this.assertMember(practiceId, actorUserId);

    const workingDays = Array.from(
      new Set((data.workingDays ?? []).map(Number).filter((d) => d >= 0 && d <= 6)),
    );
    if (workingDays.length === 0) {
      throw new AppError(400, "Select at least one working day.");
    }

    try {
      assertValidTimeRange(data.startTime, data.endTime, "working time");
    } catch (e) {
      throw new AppError(400, e instanceof Error ? e.message : "Invalid working time.");
    }

    const breakStart = data.breakStartTime?.trim() || "";
    const breakEnd = data.breakEndTime?.trim() || "";
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

    const mode =
      data.bookingType === "TOKEN" || data.bookingType === "TOKEN_BASED"
        ? ScheduleMode.TOKEN_BASED
        : ScheduleMode.TIME_BASED;
    const isTime = mode === ScheduleMode.TIME_BASED;
    const slotMins = Math.min(120, Math.max(5, Number(data.slotDurationMins) || 15));
    const patientsPerSlot = Math.min(50, Math.max(1, Number(data.patientsPerSlot) || 1));
    const licenseNo = data.licenseNo?.trim();
    const name = data.name?.trim();
    const validity =
      data.appointmentValidityDays != null
        ? Math.min(90, Math.max(1, Number(data.appointmentValidityDays) || 7))
        : undefined;

    const workSpan = minutesOf(data.endTime) - minutesOf(data.startTime);
    const maxTokens = isTime
      ? null
      : Math.max(
          patientsPerSlot,
          Math.floor((workSpan / slotMins) * patientsPerSlot),
        );

    const scheduleRows = workingDays.map((dayOfWeek) => ({
      practiceId,
      providerId,
      locationId: data.locationId,
      dayOfWeek,
      mode,
      slotIntervalMin: isTime ? slotMins : null,
      startTime: isTime ? data.startTime : null,
      endTime: isTime ? data.endTime : null,
      maxPerSlot: patientsPerSlot,
      sessionStart: !isTime ? data.startTime : null,
      sessionEnd: !isTime ? data.endTime : null,
      maxTokens,
      breakStartTime: breakStart || null,
      breakEndTime: breakEnd || null,
      isActive: true,
    }));

    const [schedules, provider] = await prisma.$transaction(async (tx) => {
      await Promise.all([
        name
          ? tx.user.update({ where: { id: providerId }, data: { name } })
          : Promise.resolve(),
        tx.doctor.updateMany({
          where: { id: providerId },
          data: {
            ...(licenseNo ? { licenseNo } : {}),
            ...(validity != null ? { appointmentValidityDays: validity } : {}),
            availableTimes: `${workingDays.join(",")}|${data.startTime}-${data.endTime}`,
          },
        }),
      ]);

      if (licenseNo || name) {
        const practice = await tx.practice.findUnique({
          where: { id: practiceId },
          select: { type: true },
        });
        await tx.practice.update({
          where: { id: practiceId },
          data: {
            ...(licenseNo ? { registrationNo: licenseNo } : {}),
            ...(name && practice?.type === "SOLO" ? { name: `Dr. ${name}` } : {}),
          },
        });
      }

      // Replace weekly rows in two statements instead of N upserts
      await tx.providerSchedule.deleteMany({
        where: {
          practiceId,
          providerId,
          locationId: data.locationId,
        },
      });
      await tx.providerSchedule.createMany({ data: scheduleRows });

      const [created, user] = await Promise.all([
        tx.providerSchedule.findMany({
          where: {
            practiceId,
            providerId,
            locationId: data.locationId,
            isActive: true,
          },
          orderBy: { dayOfWeek: "asc" },
        }),
        tx.user.findUnique({
          where: { id: providerId },
          select: {
            id: true,
            name: true,
            email: true,
            doctor: {
              select: { licenseNo: true, appointmentValidityDays: true },
            },
          },
        }),
      ]);

      return [created, user] as const;
    });

    return { schedules, provider };
  },

  async getCalendar(
    practiceId: string,
    providerId: string,
    dateStr: string,
  ) {
    const date = parseLocalDate(dateStr);
    const dayOfWeek = date.getDay();
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);

    const [schedules, bookings, overrides] = await Promise.all([
      prisma.providerSchedule.findMany({
        where: { practiceId, providerId, dayOfWeek, isActive: true },
      }),
      prisma.practiceBooking.findMany({
        where: {
          practiceId,
          providerId,
          status: { not: BookingStatus.CANCELED },
          OR: [
            { slotStart: { gte: dayStart, lte: dayEnd } },
            { sessionDate: dayStart },
          ],
        },
        orderBy: [{ tokenNumber: "asc" }, { slotStart: "asc" }],
      }),
      prisma.scheduleOverride.findMany({
        where: { practiceId, providerId, date: dayStart },
      }),
    ]);

    const activeSchedules = schedulesForActiveMode(schedules);
    const configuredMode = resolveProviderBookingMode(schedules);

    const timeSlots = timeSlotsForProviderDay(activeSchedules, date, bookings, overrides);

    const tokenSessions = activeSchedules
      .filter((s) => s.mode === "TOKEN_BASED")
      .map((s) => getTokenSession(s, date, bookings, overrides))
      .filter(Boolean);

    return {
      date: dateStr,
      bookings,
      timeSlots,
      tokenSessions,
      overrides,
      configuredMode,
    };
  },

  /**
   * Practice booking analytics (same shape as legacy doctor analytics)
   * so the doctor dashboard charts can use Procto data.
   */
  async getAnalytics(
    practiceId: string,
    actorUserId: string,
    periodType: string,
    providerId?: string | null,
  ) {
    await this.assertMember(practiceId, actorUserId);

    // Keep plan feature matrix in sync (queueAnalytics on all paid plans).
    const { NumberPoolService } = await import("./numberPool.service.js");
    await NumberPoolService.ensureDefaultPlans();

    const {
      assertFeature,
      getPracticeEntitlement,
    } = await import("./planEntitlements.js");
    const entitlement = await getPracticeEntitlement(practiceId);
    if (!entitlement.usable) {
      throw new AppError(
        403,
        "Analytics requires an active subscription. Open Billing to subscribe or renew.",
      );
    }
    await assertFeature(
      practiceId,
      "queueAnalytics",
      "Practice analytics is included with your plan. If charts stay locked, refresh Billing or contact support.",
    );

    const normalized = periodType === "monthly" ? "month" : periodType;
    const allowed = ["day", "week", "month", "year", "yoy"];
    if (!allowed.includes(normalized)) {
      throw new AppError(400, "Invalid analytics period.");
    }

    const providerFilter =
      providerId && isUuid(providerId) ? providerId : undefined;

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
      const dayStart = startOfLocalDay(today);
      buckets = Array.from({ length: 24 }, (_, h) => {
        const start = new Date(dayStart);
        start.setHours(h, 0, 0, 0);
        const end = new Date(start);
        end.setHours(h + 1, 0, 0, 0);
        end.setMilliseconds(-1);
        return {
          label: `${String(h).padStart(2, "0")}:00`,
          start,
          end,
        };
      });
    } else if (normalized === "week") {
      const startOfWeek = startOfLocalDay(today);
      startOfWeek.setDate(today.getDate() - ((today.getDay() + 7) % 7));
      buckets = Array.from({ length: 7 }, (_, i) => {
        const start = new Date(startOfWeek);
        start.setDate(startOfWeek.getDate() + i);
        const end = endOfLocalDay(start);
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
        return {
          label: String(i + 1),
          start: startOfLocalDay(start),
          end: endOfLocalDay(start),
        };
      });
    } else {
      buckets = Array.from({ length: 12 }, (_, i) => {
        const start = new Date(currentYear, i, 1);
        const end = endOfLocalDay(new Date(currentYear, i + 1, 0));
        return {
          label: start.toLocaleDateString("en-US", { month: "long" }),
          start: startOfLocalDay(start),
          end,
          prevStart: startOfLocalDay(new Date(currentYear - 1, i, 1)),
          prevEnd: endOfLocalDay(new Date(currentYear - 1, i + 1, 0)),
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
        patients: emptyGenderCounts(),
        appointments: emptyGenderCounts(),
        ...(normalized === "yoy"
          ? {
              compare: {
                patients: emptyGenderCounts(),
                appointments: emptyGenderCounts(),
              },
            }
          : {}),
      };
    }

    const rangeStart = buckets[0]?.start;
    const rangeEnd = buckets[buckets.length - 1]?.end;
    const prevStarts = buckets
      .map((b) => b.prevStart)
      .filter((d): d is Date => !!d);
    const prevEnds = buckets
      .map((b) => b.prevEnd)
      .filter((d): d is Date => !!d);
    const fetchStart =
      prevStarts.length > 0
        ? new Date(Math.min(rangeStart!.getTime(), ...prevStarts.map((d) => d.getTime())))
        : rangeStart!;
    const fetchEnd =
      prevEnds.length > 0
        ? new Date(Math.max(rangeEnd!.getTime(), ...prevEnds.map((d) => d.getTime())))
        : rangeEnd!;

    const bookings = await prisma.practiceBooking.findMany({
      where: {
        practiceId,
        ...(providerFilter ? { providerId: providerFilter } : {}),
        status: { not: BookingStatus.CANCELED },
        OR: [
          { slotStart: { gte: fetchStart, lte: fetchEnd } },
          {
            AND: [
              { sessionDate: { gte: fetchStart } },
              { sessionDate: { lte: fetchEnd } },
            ],
          },
        ],
      },
      select: {
        patientPhone: true,
        patientId: true,
        providerId: true,
        status: true,
        slotStart: true,
        sessionDate: true,
        createdAt: true,
      },
    });

    const patientIds = [
      ...new Set(
        bookings.map((b) => b.patientId).filter((id): id is string => !!id),
      ),
    ];
    const phones = [...new Set(bookings.map((b) => b.patientPhone))];
    const phoneKeys = [
      ...new Set(
        phones
          .map((p) => last10Digits(p))
          .filter((d) => d.length === 10),
      ),
    ];
    const providerIds = [
      ...new Set(bookings.map((b) => b.providerId).filter(Boolean)),
    ];

    const phoneOr =
      phoneKeys.length > 0
        ? phoneKeys.flatMap((d) => [
            { phone: { endsWith: d } },
            { patient: { contactNumber: { endsWith: d } } },
          ])
        : [];

    const [byId, byPhone, providers] = await Promise.all([
      patientIds.length
        ? prisma.user.findMany({
            where: { id: { in: patientIds } },
            select: { id: true, gender: true, phone: true },
          })
        : Promise.resolve([]),
      phoneOr.length
        ? prisma.user.findMany({
            where: {
              role: "user",
              OR: phoneOr,
            },
            select: {
              gender: true,
              phone: true,
              patient: { select: { contactNumber: true } },
            },
            take: Math.min(500, phoneKeys.length * 4 + 20),
          })
        : Promise.resolve([]),
      providerIds.length
        ? prisma.user.findMany({
            where: { id: { in: providerIds } },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
    ]);

    const genderByPatientId = Object.fromEntries(
      byId.map((u) => [u.id, normalizeGender(u.gender)]),
    );
    const genderByPhone = new Map<string, ReturnType<typeof normalizeGender>>();
    for (const u of byPhone) {
      const g = normalizeGender(u.gender);
      const phoneKey = last10Digits(u.phone);
      if (phoneKey.length === 10 && !genderByPhone.has(phoneKey)) {
        genderByPhone.set(phoneKey, g);
      }
      const contactKey = last10Digits(u.patient?.contactNumber);
      if (contactKey.length === 10 && !genderByPhone.has(contactKey)) {
        genderByPhone.set(contactKey, g);
      }
    }
    const providerName = Object.fromEntries(
      providers.map((u) => [u.id, u.name || u.email || "Doctor"]),
    );

    function bookingAt(b: (typeof bookings)[number]): Date {
      return b.slotStart ?? b.sessionDate ?? b.createdAt;
    }

    type GenderBucket = "male" | "female" | "others" | "unknown";

    function genderOf(b: (typeof bookings)[number]): GenderBucket {
      const fromId =
        b.patientId != null ? genderByPatientId[b.patientId] : undefined;
      const fromPhone = genderByPhone.get(last10Digits(b.patientPhone));
      const raw = fromId ?? fromPhone ?? null;
      if (raw === "male" || raw === "female" || raw === "others") return raw;
      return "unknown";
    }

    function accumulate(
      cell: Cell,
      list: typeof bookings,
      target: "main" | "compare",
    ) {
      const dest =
        target === "compare" && cell.compare ? cell.compare : cell;
      const seen = {
        male: new Set<string>(),
        female: new Set<string>(),
        others: new Set<string>(),
        unknown: new Set<string>(),
      };
      for (const b of list) {
        const g = genderOf(b);
        dest.appointments[g] += 1;
        const phoneKey = last10Digits(b.patientPhone) || b.patientPhone;
        if (!seen[g].has(phoneKey)) {
          seen[g].add(phoneKey);
          dest.patients[g] += 1;
        }
      }
    }

    for (const b of buckets) {
      const inBucket = bookings.filter((row) => {
        const at = bookingAt(row).getTime();
        return at >= b.start.getTime() && at <= b.end.getTime();
      });
      accumulate(result[b.label], inBucket, "main");

      if (normalized === "yoy" && b.prevStart && b.prevEnd) {
        const prev = bookings.filter((row) => {
          const at = bookingAt(row).getTime();
          return at >= b.prevStart!.getTime() && at <= b.prevEnd!.getTime();
        });
        accumulate(result[b.label], prev, "compare");
      }
    }

    // Period for byDoctor = current range only (not YoY compare range)
    const periodBookings = bookings.filter((row) => {
      const at = bookingAt(row).getTime();
      return at >= rangeStart!.getTime() && at <= rangeEnd!.getTime();
    });

    type DoctorRow = {
      providerId: string;
      name: string;
      bookings: number;
      waiting: number;
      inProgress: number;
      completed: number;
      canceled: number;
      noShow: number;
    };
    const byDoctorMap = new Map<string, DoctorRow>();
    for (const b of periodBookings) {
      const id = b.providerId || "unknown";
      let row = byDoctorMap.get(id);
      if (!row) {
        row = {
          providerId: id,
          name: providerName[id] || "Doctor",
          bookings: 0,
          waiting: 0,
          inProgress: 0,
          completed: 0,
          canceled: 0,
          noShow: 0,
        };
        byDoctorMap.set(id, row);
      }
      row.bookings += 1;
      if (b.status === BookingStatus.WAITING) row.waiting += 1;
      else if (b.status === BookingStatus.IN_PROGRESS) row.inProgress += 1;
      else if (b.status === BookingStatus.COMPLETED) row.completed += 1;
      else if (b.status === BookingStatus.NO_SHOW) row.noShow += 1;
    }

    // Also count canceled in period (excluded from main query)
    const canceledInPeriod = await prisma.practiceBooking.groupBy({
      by: ["providerId"],
      where: {
        practiceId,
        status: BookingStatus.CANCELED,
        OR: [
          { slotStart: { gte: rangeStart!, lte: rangeEnd! } },
          {
            AND: [
              { sessionDate: { gte: rangeStart! } },
              { sessionDate: { lte: rangeEnd! } },
            ],
          },
        ],
      },
      _count: { _all: true },
    });
    for (const c of canceledInPeriod) {
      const id = c.providerId || "unknown";
      let row = byDoctorMap.get(id);
      if (!row) {
        row = {
          providerId: id,
          name: providerName[id] || "Doctor",
          bookings: 0,
          waiting: 0,
          inProgress: 0,
          completed: 0,
          canceled: 0,
          noShow: 0,
        };
        byDoctorMap.set(id, row);
      }
      row.canceled += c._count._all;
      row.bookings += c._count._all;
    }

    const byDoctor = [...byDoctorMap.values()].sort(
      (a, b) => b.bookings - a.bookings,
    );

    return { series: result, byDoctor };
  },
};
