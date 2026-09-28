import { prisma } from "../../db/prisma.js";
import { AppError, ResponseHandler } from "../../core/response.js";
import { generateHash } from "../../core/security.js";
import { isUuid } from "../../core/params.js";
import type { PracticeType, PracticeMemberRole } from "@prisma/client";
import { allocateUniquePracticeMrnPrefix } from "../../core/patientMrn.js";
import {
  BookingStatus,
  ScheduleMode,
  ScheduleVersionStatus,
  OverrideType,
  Prisma,
} from "@prisma/client";
import { AuthService } from "../auth.js";
import {
  assertValidTimeRange,
  endOfLocalDay,
  formatLocalDate,
  formatPracticeDateTime,
  getTokenSession,
  minutesOf,
  parseLocalDate,
  PRACTICE_TIMEZONE,
  practiceWeekday,
  resolveProviderBookingMode,
  schedulesForActiveMode,
  startOfLocalDay,
  timeSlotsForProviderDay,
  zonedDateTime,
} from "./slotEngine.js";
import {
  ACTIVE_BOOKING_STATUSES,
  ACTIVE_VERSION,
  type ScheduleConflict,
  summarizeImpact,
  addDaysIso,
  applyNoticePeriod,
  bookingDayIso,
  bookingFitsSchedule,
  dateKey,
  dbDate,
  earliestSafeDate,
  findConflicts,
  loadSchedulesOn,
  localDayOfSessionDate,
  NOTICE_HOURS_OPTIONS,
  noticeEndsAt,
  noticeLabel,
  normalizeNoticeHours,
  pickEffectiveVersion,
  summarizeVersion,
  todayIso,
  upcomingVersionKeys,
} from "./scheduleVersions.js";
import { ScheduleAlertService } from "./scheduleAlerts.service.js";
import {
  checkExtraWindow,
  clinicMinutesNow,
  dayWindows,
  DESK_ROLES,
  drName,
  hm12,
} from "./calendarSlots.js";

type NoticePlan = {
  hours: number;
  requestedFrom: string;
  adjusted: boolean;
  blockedBy: ScheduleConflict[];
};

/** " Starts … instead of …" sentence when the notice period moved the start date. */
function noticeNote(notice: NoticePlan, effectiveFrom: string): string {
  if (!notice.adjusted) return "";
  const k = notice.blockedBy.length;
  return (
    ` It starts ${effectiveFrom} instead of ${notice.requestedFrom}: booked patients get ${noticeLabel(notice.hours)} notice,` +
    ` and ${k} visit${k === 1 ? "" : "s"} before then would have been affected.`
  );
}
import { last10Digits, normalizeGender } from "../../core/gender.js";
import { ageFromDob } from "../../core/dob.js";
import {
  publicPatientAddress,
  publicPatientEmail,
} from "../../core/patientDisplay.js";

const MEMBER_CACHE_TTL_MS = 60_000;
const memberCache = new Map<
  string,
  { expires: number; member: { id: string; role: PracticeMemberRole; isActive: boolean; practiceId: string; userId: string } }
>();

const MINE_CACHE_TTL_MS = 30_000;
const mineCache = new Map<string, { expires: number; data: unknown }>();

function emptyGenderCounts() {
  return { male: 0, female: 0, others: 0, unknown: 0 };
}

function emptyStatusCounts() {
  return { completed: 0, cancelled: 0, rescheduled: 0 };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Patient-level General Documents (WhatsApp Branch F → General Document). */
function readPatientGeneralDocuments(raw: unknown): Array<{
  name: string;
  url: string;
  uploadedAt: string;
}> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => {
      const row = d as { name?: string; url?: string; uploadedAt?: string };
      return {
        name: String(row.name || "").trim() || "Document",
        url: String(row.url || "").trim(),
        uploadedAt: row.uploadedAt || new Date().toISOString(),
      };
    })
    .filter((d) => d.url.length > 0);
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

/** Drop find-clinic cache so new reviews / plan flags appear promptly. */
export function clearListPublicCache() {
  listPublicCache.clear();
}

function clearMineCacheFor(userId: string) {
  mineCache.delete(userId);
}

/** Default Mon–Fri clinic hours so booking works immediately after add/register. */
async function seedDefaultProviderSchedule(opts: {
  practiceId: string;
  locationId: string;
  providerId: string;
  workingDays?: number[];
  bookingType?: "TIME" | "TOKEN";
  startTime?: string;
  endTime?: string;
  breakStartTime?: string;
  breakEndTime?: string;
  slotDurationMins?: number;
  patientsPerSlot?: number;
}) {
  const workingDays = (
    opts.workingDays?.length ? opts.workingDays : [1, 2, 3, 4, 5]
  ).filter((d) => d >= 0 && d <= 6);
  if (workingDays.length === 0) return;

  const existing = await prisma.providerSchedule.count({
    where: {
      practiceId: opts.practiceId,
      providerId: opts.providerId,
      isActive: true,
    },
  });
  if (existing > 0) return;

  const mode =
    opts.bookingType === "TOKEN" ? ScheduleMode.TOKEN_BASED : ScheduleMode.TIME_BASED;
  const startTime = opts.startTime || "09:00";
  const endTime = opts.endTime || "17:00";
  const slotMins = Math.min(
    120,
    Math.max(5, Number(opts.slotDurationMins) || 15),
  );
  const patientsPerSlot =
    mode === ScheduleMode.TIME_BASED
      ? 1
      : Math.min(50, Math.max(1, Number(opts.patientsPerSlot) || 1));
  const breakStart = opts.breakStartTime?.trim() || "13:00";
  const breakEnd = opts.breakEndTime?.trim() || "14:00";

  await prisma.providerSchedule.createMany({
    data: workingDays.map((dayOfWeek) => ({
      practiceId: opts.practiceId,
      locationId: opts.locationId,
      providerId: opts.providerId,
      dayOfWeek,
      mode,
      slotIntervalMin: mode === ScheduleMode.TIME_BASED ? slotMins : null,
      startTime: mode === ScheduleMode.TIME_BASED ? startTime : null,
      endTime: mode === ScheduleMode.TIME_BASED ? endTime : null,
      maxPerSlot: patientsPerSlot,
      sessionStart: mode === ScheduleMode.TOKEN_BASED ? startTime : null,
      sessionEnd: mode === ScheduleMode.TOKEN_BASED ? endTime : null,
      maxTokens:
        mode === ScheduleMode.TOKEN_BASED
          ? Math.max(
              patientsPerSlot,
              Math.floor(
                ((minutesOf(endTime) - minutesOf(startTime)) / slotMins) *
                  patientsPerSlot,
              ),
            )
          : null,
      breakStartTime: breakStart || null,
      breakEndTime: breakEnd || null,
      isActive: true,
    })),
  });
}

type ScheduleRowInput = Omit<
  ProviderScheduleRow,
  "id" | "createdAt" | "updatedAt" | "effectiveFrom" | "status" | "submittedById"
>;

function toRowInput({
  id: _id,
  createdAt: _c,
  updatedAt: _u,
  effectiveFrom: _e,
  status: _s,
  submittedById: _b,
  ...row
}: ProviderScheduleRow): ScheduleRowInput {
  return row;
}

type ProviderScheduleRow = Awaited<ReturnType<typeof prisma.providerSchedule.findFirstOrThrow>>;

type ProviderScheduleForm = {
  locationId: string;
  bookingType: "TIME" | "TOKEN" | "TIME_BASED" | "TOKEN_BASED";
  workingDays: number[];
  startTime: string;
  endTime: string;
  breakStartTime?: string;
  breakEndTime?: string;
  slotDurationMins?: number;
  patientsPerSlot?: number;
  /** YYYY-MM-DD clinic day the schedule starts; default today. */
  effectiveFrom?: string;
};

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
    /** Start a 14-day trial on this plan during registration. */
    planId?: string;
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
        "Doctors are added from the clinic dashboard after registration — not during signup. Independently registered doctors cannot join a clinic.",
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
        // Never attach independently registered doctors during onboard.
        // Clinics add staff only via dashboard createDoctor.
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

    const mrnPrefix = await allocateUniquePracticeMrnPrefix(data.name);

    const practice = await prisma.practice.create({
      data: {
        name: data.name,
        slug,
        type: practiceType,
        specialty: data.specialty,
        consultationFee,
        mrnPrefix,
        whatsappBusinessNumber: waDigits || publicPhone,
        registrationNo: data.registrationNo?.trim() || null,
        phone: publicPhone,
        email: data.email?.trim() || null,
        bgSrc: (data.bgSrc ?? data.photoUrl)?.trim() || null,
        isDirectoryListed: false,
        faqKb: data.faqKb ?? {
          address: `${data.location.address}, ${data.location.city}`,
          fee: `₹${consultationFee}`,
          timings: "Mon–Fri 09:00–17:00 (doctors set exact hours when added).",
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
              // Clinic owners keep a doctorId so they can use Doctor Login too.
              doctorId: data.ownerUserId,
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

    // Registration-time trial so the clinic dashboard is usable immediately.
    if (data.planId?.trim()) {
      try {
        const { BillingService } = await import("./billing.service.js");
        await BillingService.selectPlan(
          practice.id,
          data.planId.trim(),
          data.ownerUserId,
          "trial",
        );
      } catch {
        // Practice is still created; billing can be finished from Subscription.
      }
    }

    clearMineCacheFor(data.ownerUserId);

    // Auto-add registration Tel to Meta WABA phone list (+ GlucoGuide number pool).
    const regPhone =
      practice.phone ||
      practice.whatsappBusinessNumber ||
      data.phone?.replace(/\D/g, "").slice(-10) ||
      "";
    if (regPhone) {
      void import("./metaWhatsApp.service.js")
        .then(({ MetaWhatsAppService }) =>
          MetaWhatsAppService.ensurePhoneListedAtRegistration({
            practiceId: practice.id,
            phoneNumber: regPhone,
            displayName: practice.name,
          }),
        )
        .then((r) => {
          if (r.ok) {
            console.log(
              `[Meta] registration phone ${regPhone} → ${r.mode}` +
                (r.phoneNumberId ? ` id=${r.phoneNumberId}` : ""),
            );
          } else {
            console.warn(
              `[Meta] registration phone ${regPhone} deferred: ${r.message}`,
            );
          }
        })
        .catch((err) =>
          console.warn(
            "[Meta] registration phone provision failed:",
            err instanceof Error ? err.message : err,
          ),
        );
    }

    return practice;
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
      reviewsEnabled,
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

  async getBySlug(slugOrId: string) {
    const key = decodeURIComponent(String(slugOrId ?? "")).trim();
    if (!key) ResponseHandler.notFoundError("practice not found.");

    const practice = await prisma.practice.findFirst({
      where: isUuid(key) ? { OR: [{ slug: key }, { id: key }] } : { slug: key },
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
          where: { ...ACTIVE_VERSION, effectiveFrom: { lte: dbDate(todayIso()) } },
          select: {
            mode: true,
            dayOfWeek: true,
            providerId: true,
            locationId: true,
            effectiveFrom: true,
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
    const today = todayIso();
    const byProvider = new Map<string, NonNullable<typeof practice>["schedules"]>();
    for (const s of practice!.schedules) {
      byProvider.set(s.providerId, [...(byProvider.get(s.providerId) ?? []), s]);
    }
    const schedules = [...byProvider.values()]
      .flatMap((rows) => pickEffectiveVersion(rows, today))
      .map(({ mode, dayOfWeek, providerId }) => ({ mode, dayOfWeek, providerId }));
    return {
      ...practice!,
      schedules,
      reviews,
      reviewSummary,
      reviewsEnabled,
      featured: hasFeatureFlag(features, "priorityListing"),
      planName: usable ? subFull?.plan?.name ?? null : null,
    };
  },

  async listConversations(practiceId: string, actorUserId: string) {
    await this.assertMember(practiceId, actorUserId);
    const rows = await prisma.whatsAppConversation.findMany({
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

    const phones = rows.map((r) => r.patientPhone.replace(/\D/g, ""));
    const last10s = [
      ...new Set(phones.map((p) => p.slice(-10)).filter((p) => p.length === 10)),
    ];
    const patients =
      last10s.length === 0
        ? []
        : await prisma.user.findMany({
            where: {
              role: "user",
              OR: last10s.flatMap((d) => [
                { phone: d },
                { phone: { endsWith: d } },
                { patient: { is: { contactNumber: d } } },
                { patient: { is: { contactNumber: { endsWith: d } } } },
              ]),
            },
            select: {
              id: true,
              name: true,
              phone: true,
              patient: { select: { contactNumber: true } },
            },
            take: 200,
          });

    function matchPatient(waPhone: string) {
      const digits = waPhone.replace(/\D/g, "");
      const last10 = digits.slice(-10);
      return (
        patients.find((p) => {
          const a = String(p.phone || "").replace(/\D/g, "");
          const b = String(p.patient?.contactNumber || "").replace(/\D/g, "");
          return (
            a === digits ||
            b === digits ||
            a.endsWith(last10) ||
            b.endsWith(last10)
          );
        }) ?? null
      );
    }

    return rows.map((r) => {
      const state =
        r.state && typeof r.state === "object" && !Array.isArray(r.state)
          ? (r.state as Record<string, unknown>)
          : {};
      const patient = matchPatient(r.patientPhone);
      return {
        id: r.id,
        patientPhone: r.patientPhone,
        status: r.status,
        updatedAt: r.updatedAt,
        patientUserId: patient?.id ?? null,
        patientName: patient?.name?.trim() || null,
        supportRequestedAt:
          typeof state.supportRequestedAt === "string"
            ? state.supportRequestedAt
            : null,
        supportLabel:
          typeof state.supportLabel === "string" ? state.supportLabel : null,
        agentTransfer:
          state.step === "agent_transfer" ||
          state.handedOff === true ||
          r.status === "handed_off",
      };
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

  /**
   * Wipe WhatsApp bot state (+ optional WA-registered patient) for a phone
   * so the language / REGISTER welcome flow can be retested cleanly.
   */
  async clearWhatsAppPhone(
    practiceId: string,
    phoneRaw: string,
    actorUserId: string,
  ) {
    await this.assertMember(practiceId, actorUserId);
    const phone = phoneRaw.replace(/\D/g, "").slice(-10);
    if (phone.length !== 10) {
      throw new AppError(400, "A valid 10-digit phone is required.");
    }

    const conversations = await prisma.whatsAppConversation.deleteMany({
      where: {
        patientPhone: { endsWith: phone },
      },
    });

    const bookingIds = (
      await prisma.practiceBooking.findMany({
        where: { patientPhone: { endsWith: phone } },
        select: { id: true },
      })
    ).map((b) => b.id);

    const notifications = bookingIds.length
      ? await prisma.notificationEvent.deleteMany({
          where: { bookingId: { in: bookingIds } },
        })
      : { count: 0 };

    const { PatientService } = await import("../patient.js");
    const existing = await PatientService.findByPhone(phone);
    let patientCleared: { id: string; name: string | null; email: string | null } | null =
      null;
    if (existing) {
      const email = (existing.email ?? "").toLowerCase();
      const waLocal =
        email.endsWith("@patients.glucoguide.local") ||
        email.startsWith(`wa${phone}@`) ||
        /^wa\d+@/.test(email);
      // Only auto-delete WhatsApp-provisioned patients; never wipe normal web signups.
      if (waLocal || !existing.email) {
        await prisma.user.delete({ where: { id: existing.id } });
        patientCleared = {
          id: existing.id,
          name: existing.name,
          email: existing.email,
        };
      }
    }

    return {
      phone,
      conversationsDeleted: conversations.count,
      notificationsDeleted: notifications.count,
      patientCleared,
    };
  },

  async assertMember(practiceId: string, userId: string) {
    const key = `${practiceId}:${userId}`;
    const cached = memberCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.member;
    }
    const member = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId, userId } },
    });
    if (!member?.isActive) ResponseHandler.noPermission("not a member of this practice.");
    memberCache.set(key, {
      member: member!,
      expires: Date.now() + MEMBER_CACHE_TTL_MS,
    });
    if (memberCache.size > 1000) {
      const now = Date.now();
      for (const [k, v] of memberCache) {
        if (v.expires <= now) memberCache.delete(k);
      }
    }
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

  /** Owner/admin, or the only active doctor of a SOLO practice (created with DOCTOR role). */
  async assertProfileEditor(practiceId: string, userId: string) {
    const member = await this.assertMember(practiceId, userId);
    if (member.role === "PRACTICE_OWNER" || member.role === "PRACTICE_ADMIN") {
      return member;
    }
    if (member.role === "DOCTOR") {
      const [practice, activeMembers] = await Promise.all([
        prisma.practice.findUnique({
          where: { id: practiceId },
          select: { type: true },
        }),
        prisma.practiceMember.count({ where: { practiceId, isActive: true } }),
      ]);
      if (practice?.type === "SOLO" && activeMembers === 1) return member;
    }
    ResponseHandler.noPermission("only clinic owners can manage doctors and patients.");
    return member;
  },

  /**
   * Clinic owners/admins manage any provider; clinic-staff doctors manage
   * only themselves (own schedule / profile / leave).
   */
  async assertCanManageProvider(
    practiceId: string,
    actorUserId: string,
    providerId: string,
  ) {
    const member = await this.assertMember(practiceId, actorUserId);
    if (
      member.role === "PRACTICE_OWNER" ||
      member.role === "PRACTICE_ADMIN"
    ) {
      return member;
    }
    if (providerId !== actorUserId) {
      throw new AppError(
        403,
        "Clinic staff doctors can only manage their own schedule and profile. Clinic owners manage the full roster.",
      );
    }
    return member;
  },

  /**
   * Clinic-wide booking/patient lists are for owners/admins only.
   * Staff doctors are forced to their own providerId (even if the client
   * omits or spoofs the query param).
   */
  async resolveDataProviderScope(
    practiceId: string,
    actorUserId: string,
    requestedProviderId?: string | null,
  ): Promise<string | undefined> {
    const member = await this.assertMember(practiceId, actorUserId);
    const isAdmin =
      member.role === "PRACTICE_OWNER" || member.role === "PRACTICE_ADMIN";
    const requested = requestedProviderId?.trim() || undefined;
    if (!isAdmin) {
      if (requested && requested !== actorUserId) {
        throw new AppError(
          403,
          "Clinic staff doctors can only view their own appointments and patients. Clinic owners see the full roster.",
        );
      }
      return actorUserId;
    }
    return requested;
  },

  /** Staff doctors may open visits assigned to them; clinic admins any visit. */
  async assertCanViewBooking(
    practiceId: string,
    actorUserId: string,
    providerId: string,
  ) {
    await this.resolveDataProviderScope(practiceId, actorUserId, providerId);
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
    if (data.role === "DOCTOR") {
      const target = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { createdBy: true, role: true },
      });
      if (!target || target.role !== "doctor") {
        throw new AppError(400, "That account is not a doctor.");
      }
      const prior = await prisma.practiceMember.findUnique({
        where: {
          practiceId_userId: { practiceId, userId: data.userId },
        },
      });
      if (!prior) {
        const solo = await prisma.practiceMember.findFirst({
          where: {
            userId: data.userId,
            isActive: true,
            practice: { type: "SOLO" },
          },
        });
        if (
          target.createdBy === "self_attempted" ||
          solo ||
          target.createdBy === "clinic_owner_signup"
        ) {
          throw new AppError(
            400,
            "Independently registered doctors cannot be added to a clinic. Create a new doctor from the clinic dashboard instead.",
          );
        }
      }
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
   * Create a clinic-staff doctor from the dashboard (new account only).
   * Independently registered doctors cannot be linked into a clinic.
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
      // Reactivate only if this email was previously on THIS clinic roster.
      // Never link independently registered / solo doctors.
      if (!existingMember) {
        throw new AppError(
          400,
          "Independently registered doctors cannot be added to a clinic. Create a new doctor account from the clinic dashboard (use a different email if needed).",
        );
      }
      if (
        user.createdBy === "self_attempted" ||
        user.createdBy === "clinic_owner_signup"
      ) {
        throw new AppError(
          400,
          "Independently registered doctors cannot be added to a clinic. Create a new doctor account from the clinic dashboard instead.",
        );
      }
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
      const member = await prisma.practiceMember.update({
        where: { id: existingMember.id },
        data: { isActive: true, role: "DOCTOR", doctorId: user.id },
      });
      const practiceLoc = await prisma.clinicLocation.findFirst({
        where: { practiceId, isActive: true },
        select: { id: true },
      });
      if (practiceLoc) {
        await seedDefaultProviderSchedule({
          practiceId,
          locationId: practiceLoc.id,
          providerId: user.id,
        });
      }
      clearMineCacheFor(user.id);
      clearMineCacheFor(actorUserId);
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
              : "General Medicine — clinic staff doctor.",
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

    const practiceLoc = await prisma.clinicLocation.findFirst({
      where: { practiceId, isActive: true },
      select: { id: true },
    });
    if (practiceLoc) {
      await seedDefaultProviderSchedule({
        practiceId,
        locationId: practiceLoc.id,
        providerId: user.id,
      });
    }

    clearMineCacheFor(user.id);
    clearMineCacheFor(actorUserId);

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
   * One row per person (patientId) — family members who share a WhatsApp
   * number appear separately. `phone` is always the number used to book.
   */
  async listPatients(practiceId: string, actorUserId: string) {
    const providerScope = await this.resolveDataProviderScope(
      practiceId,
      actorUserId,
    );

    // Cap history — full-table scans + fat JSON columns were making this slow
    // on Railway ↔ Supabase even for small clinics.
    const since = new Date();
    since.setDate(since.getDate() - 365);

    const bookings = await prisma.practiceBooking.findMany({
      where: {
        practiceId,
        ...(providerScope ? { providerId: providerScope } : {}),
        OR: [
          { createdAt: { gte: since } },
          { slotStart: { gte: since } },
          { sessionDate: { gte: since } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 1500,
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

    type PatientAgg = {
      /** WhatsApp / contact number used to place the booking. */
      phone: string;
      name: string | null;
      patientId: string | null;
      bookingCount: number;
      lastVisitAt: Date | null;
      lastStatus: string | null;
      providers: Set<string>;
      recent: typeof bookings;
    };

    /**
     * One roster row per member name on a booking number.
     * Family shares the WhatsApp/clinic number; patientId may also collide —
     * never key by patientId alone.
     */
    const rowKey = (b: (typeof bookings)[number]) => {
      const name = (b.patientName || "").trim().toLowerCase() || "_unknown";
      return `phone:${b.patientPhone}|name:${name}`;
    };

    const byPerson = new Map<string, PatientAgg>();

    for (const b of bookings) {
      const key = rowKey(b);
      let row = byPerson.get(key);
      if (!row) {
        row = {
          phone: b.patientPhone,
          name: b.patientName,
          patientId: b.patientId,
          bookingCount: 0,
          lastVisitAt: null,
          lastStatus: null,
          providers: new Set(),
          recent: [],
        };
        byPerson.set(key, row);
      }
      row.bookingCount += 1;
      row.providers.add(b.providerId);
      if (b.patientName?.trim()) row.name = b.patientName.trim();
      // Keep a patientId when present; do not overwrite a set id with null.
      if (b.patientId) row.patientId = b.patientId;
      const visitAt = b.slotStart ?? b.sessionDate ?? b.createdAt;
      if (!row.lastVisitAt || visitAt > row.lastVisitAt) {
        row.lastVisitAt = visitAt;
        row.lastStatus = b.status;
        row.phone = b.patientPhone;
      }
      if (row.recent.length < 8) row.recent.push(b);
    }

    const providerIds = [...new Set(bookings.map((b) => b.providerId))];
    const patientIds = [
      ...new Set(
        [...byPerson.values()]
          .map((row) => row.patientId)
          .filter((id): id is string => !!id),
      ),
    ];
    const phones = [
      ...new Set(
        [...byPerson.values()].map((row) => row.phone).filter(Boolean),
      ),
    ];

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
              imgSrc: true,
              patient: {
                select: {
                  mrn: true,
                  dateOfBirth: true,
                  contactNumber: true,
                  relationship: true,
                  documents: true,
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
              imgSrc: true,
              patient: {
                select: {
                  mrn: true,
                  dateOfBirth: true,
                  contactNumber: true,
                  relationship: true,
                  documents: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const providerName = Object.fromEntries(providers.map((p) => [p.id, p.name]));
    const patientById = Object.fromEntries(patientsById.map((p) => [p.id, p]));
    /** phone → all linked profiles (self + family) for name-matched enrichment. */
    const patientsByPhone = new Map<string, Array<(typeof usersByPhone)[number]>>();
    for (const u of usersByPhone) {
      const keys = [u.phone, u.patient?.contactNumber].filter(
        (x): x is string => Boolean(x),
      );
      for (const k of keys) {
        const list = patientsByPhone.get(k) ?? [];
        if (!list.some((x) => x.id === u.id)) list.push(u);
        patientsByPhone.set(k, list);
      }
    }

    const namesMatch = (a: string | null | undefined, b: string | null | undefined) => {
      const x = (a || "").trim().toLowerCase();
      const y = (b || "").trim().toLowerCase();
      return Boolean(x) && x === y;
    };

    const bookedRows = [...byPerson.values()]
      .sort((a, b) => (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0))
      .map((row) => {
        const bookingName = (row.name || "").trim() || null;
        const byId = row.patientId ? patientById[row.patientId] : undefined;
        const phoneMatches = patientsByPhone.get(row.phone) ?? [];
        const byName =
          bookingName
            ? phoneMatches.find((u) => namesMatch(u.name, bookingName))
            : undefined;
        // Prefer exact profile for this member; never steal another family profile.
        const linked = byId ?? byName ?? null;
        const relationship = linked?.patient?.relationship?.trim() || null;
        // Display name is always the member booked for (booking patientName).
        const memberName = bookingName || linked?.name?.trim() || null;

        // General Documents land on the WhatsApp primary (self) profile.
        const phoneSelf =
          phoneMatches.find((u) => !u.patient?.relationship?.trim()) ??
          phoneMatches[0] ??
          null;
        const isPrimaryMember =
          !relationship &&
          (!phoneSelf || !linked || linked.id === phoneSelf.id);
        const attachments = readPatientGeneralDocuments(
          isPrimaryMember
            ? (phoneSelf?.patient?.documents ?? linked?.patient?.documents)
            : linked?.patient?.documents,
        );

        return {
          phone: row.phone,
          bookedViaPhone: row.phone,
          name: memberName,
          patientId: linked?.id ?? row.patientId,
          mrn: linked?.patient?.mrn ?? null,
          relationship,
          email: publicPatientEmail(linked?.email),
          gender: linked?.gender ?? null,
          address: publicPatientAddress(linked?.address),
          imgSrc: linked?.imgSrc ?? null,
          dateOfBirth: linked?.patient?.dateOfBirth ?? null,
          age: ageFromDob(linked?.patient?.dateOfBirth),
          attachments,
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
            patientName: b.patientName,
            patientPhone: b.patientPhone,
            notes: b.notes,
            consultationType: b.consultationType,
            disease: b.disease,
            doctorRemarks: b.doctorRemarks,
            medicines: b.medicines,
            documents: b.documents,
            createdAt: b.createdAt,
          })),
          registeredAt: null as Date | null,
        };
      });

    // Clinic staff doctors only see patients booked with them; a solo doctor owns the roster.
    if (providerScope) {
      const practice = await prisma.practice.findUnique({
        where: { id: practiceId },
        select: { type: true },
      });
      if (practice?.type !== "SOLO") return bookedRows;
    }

    const registered = await this.listRegisteredWithoutBookings(
      practiceId,
      bookedRows,
    );
    if (!registered.length) return bookedRows;

    const sortAt = (r: { lastVisitAt: Date | null; registeredAt: Date | null }) =>
      (r.lastVisitAt ?? r.registeredAt)?.getTime() ?? 0;
    return [...bookedRows, ...registered].sort((a, b) => sortAt(b) - sortAt(a));
  },

  /**
   * Profiles registered via this practice (practice MRN prefix) or on its
   * WhatsApp line (self + family sharing the number) that have no booking yet.
   */
  async listRegisteredWithoutBookings(
    practiceId: string,
    bookedRows: Array<{
      phone: string;
      name: string | null;
      patientId: string | null;
    }>,
  ) {
    const last10 = (raw: string | null | undefined) =>
      String(raw || "").replace(/\D/g, "").slice(-10);

    const [practice, conversations] = await Promise.all([
      prisma.practice.findUnique({
        where: { id: practiceId },
        select: { mrnPrefix: true },
      }),
      prisma.whatsAppConversation.findMany({
        where: { practiceId },
        orderBy: { updatedAt: "desc" },
        take: 500,
        select: { patientPhone: true },
      }),
    ]);

    const convPhones = [
      ...new Set(
        conversations
          .map((c) => last10(c.patientPhone))
          .filter((d) => d.length >= 8),
      ),
    ];
    const prefix = practice?.mrnPrefix?.trim();
    const or: Prisma.UserWhereInput[] = [
      ...(prefix ? [{ patient: { mrn: { startsWith: `${prefix}MR` } } }] : []),
      ...convPhones.flatMap((d) => [
        { phone: { endsWith: d } },
        { patient: { contactNumber: { endsWith: d } } },
      ]),
    ];
    if (!or.length) return [];

    const users = await prisma.user.findMany({
      where: { role: "user", patient: { isNot: null }, OR: or },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        gender: true,
        address: true,
        imgSrc: true,
        createdAt: true,
        patient: {
          select: {
            mrn: true,
            dateOfBirth: true,
            contactNumber: true,
            relationship: true,
            documents: true,
          },
        },
      },
    });

    const bookedIds = new Set(
      bookedRows.map((r) => r.patientId).filter((id): id is string => !!id),
    );
    const personKey = (phone: string | null | undefined, name: string | null | undefined) =>
      `${last10(phone)}|${(name || "").trim().toLowerCase()}`;
    const bookedKeys = new Set(bookedRows.map((r) => personKey(r.phone, r.name)));

    return users
      .filter((u) => {
        if (bookedIds.has(u.id)) return false;
        const phone = u.patient?.contactNumber || u.phone;
        return !bookedKeys.has(personKey(phone, u.name));
      })
      .map((u) => {
        const phone = u.patient?.contactNumber || u.phone || "";
        return {
          phone,
          bookedViaPhone: phone,
          name: u.name?.trim() || null,
          patientId: u.id,
          mrn: u.patient?.mrn ?? null,
          relationship: u.patient?.relationship?.trim() || null,
          email: publicPatientEmail(u.email),
          gender: u.gender ?? null,
          address: publicPatientAddress(u.address),
          imgSrc: u.imgSrc ?? null,
          dateOfBirth: u.patient?.dateOfBirth ?? null,
          age: ageFromDob(u.patient?.dateOfBirth),
          attachments: readPatientGeneralDocuments(u.patient?.documents),
          bookingCount: 0,
          lastVisitAt: null as Date | null,
          lastStatus: null as string | null,
          providerNames: [] as string[],
          recentBookings: [] as never[],
          registeredAt: u.createdAt as Date | null,
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
      effectiveFrom?: string;
    },
    actorUserId: string,
  ) {
    await this.assertCanManageProvider(practiceId, actorUserId, providerId);

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
      maxPerSlot: isTime ? 1 : Math.min(50, Math.max(1, data.maxPerSlot ?? 1)),
      sessionStart: !isTime ? (data.sessionStart ?? null) : null,
      sessionEnd: !isTime ? (data.sessionEnd ?? null) : null,
      maxTokens: !isTime ? (data.maxTokens ?? null) : null,
      breakStartTime: data.breakStartTime ?? null,
      breakEndTime: data.breakEndTime ?? null,
      isActive: true,
    };

    // Copy the version in force on that day, change one weekday, save as a
    // version starting that day. One booking mode per version; later versions untouched.
    const rowsFrom = async (dayIso: string) => {
      const base = await loadSchedulesOn(
        { practiceId, providerId, locationId: data.locationId },
        dayIso,
      );
      return [
        ...base
          .filter((s) => s.dayOfWeek !== data.dayOfWeek && s.mode === data.mode)
          .map(toRowInput),
        payload,
      ];
    };
    const requested = this.resolveEffectiveFrom(data.effectiveFrom);
    let rows = await rowsFrom(requested);
    let plan = await this.planVersionStart(
      practiceId,
      providerId,
      data.locationId,
      rows,
      data.mode,
      requested,
    );
    if (plan.effectiveFrom !== requested) {
      const notice = plan.notice;
      rows = await rowsFrom(plan.effectiveFrom);
      plan = await this.planVersionStart(
        practiceId,
        providerId,
        data.locationId,
        rows,
        data.mode,
        plan.effectiveFrom,
      );
      plan.notice = { ...notice, adjusted: plan.effectiveFrom !== notice.requestedFrom };
    }
    const effectiveFrom = plan.effectiveFrom;
    const conflicts = plan.conflicts;

    const status = await prisma.$transaction((tx) =>
      this.writeScheduleVersion(tx, {
        practiceId,
        providerId,
        locationId: data.locationId,
        rows,
        effectiveFrom,
        actorUserId,
        pending: conflicts.length > 0,
      }),
    );
    const saved = await prisma.providerSchedule.findFirst({
      where: {
        practiceId,
        providerId,
        locationId: data.locationId,
        dayOfWeek: data.dayOfWeek,
        effectiveFrom: dbDate(effectiveFrom),
        status,
      },
    });
    return {
      ...saved,
      conflicts,
      impact: summarizeImpact(conflicts),
      notice: plan.notice,
      message: noticeNote(plan.notice, effectiveFrom).trim() || null,
    };
  },

  /**
   * Write one weekly version starting `effectiveFrom`. `pending` (it clashes with
   * booked visits) → PENDING_VERIFICATION: the slot engine keeps the current
   * schedule until someone activates it. Otherwise ACTIVE, replacing active
   * versions that start on/after it. An earlier pending version for this doctor
   * and location is superseded either way. Bookings are never touched.
   */
  async writeScheduleVersion(
    tx: Prisma.TransactionClient,
    opts: {
      practiceId: string;
      providerId: string;
      locationId: string;
      rows: ScheduleRowInput[];
      effectiveFrom: string;
      actorUserId: string;
      pending: boolean;
    },
  ): Promise<ScheduleVersionStatus> {
    const scope = {
      practiceId: opts.practiceId,
      providerId: opts.providerId,
      locationId: opts.locationId,
    };
    const status = opts.pending
      ? ScheduleVersionStatus.PENDING_VERIFICATION
      : ScheduleVersionStatus.ACTIVE;
    await tx.providerSchedule.deleteMany({
      where: { ...scope, status: ScheduleVersionStatus.PENDING_VERIFICATION },
    });
    if (!opts.pending) {
      await tx.providerSchedule.deleteMany({
        where: {
          ...scope,
          status: ScheduleVersionStatus.ACTIVE,
          effectiveFrom: { gte: dbDate(opts.effectiveFrom) },
        },
      });
    }
    await tx.providerSchedule.createMany({
      data: opts.rows.map((r) => ({
        ...r,
        ...scope,
        effectiveFrom: dbDate(opts.effectiveFrom),
        status,
        submittedById: opts.actorUserId,
      })),
    });
    console.log(
      `[schedule] version ${opts.effectiveFrom} saved ${status} provider=${opts.providerId} by=${opts.actorUserId}`,
    );
    return status;
  },

  /** Requested start date (YYYY-MM-DD), never before today; default today. */
  resolveEffectiveFrom(requested: string | undefined | null, minIso = todayIso()): string {
    const raw = requested?.trim();
    if (!raw) return minIso;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(dbDate(raw).getTime())) {
      throw new AppError(400, "Effective date must be YYYY-MM-DD.");
    }
    if (raw > addDaysIso(minIso, 366)) {
      throw new AppError(400, "Effective date can be at most one year ahead.");
    }
    return raw < minIso ? minIso : raw;
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
      return this.createExtraSlots(practiceId, providerId, data, actorUserId);
    }
    await this.assertCanManageProvider(practiceId, actorUserId, providerId);

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
        status: {
          in: [
            BookingStatus.SCHEDULED,
            BookingStatus.REQUESTED,
            BookingStatus.ACCEPTED,
          ],
        },
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
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: PRACTICE_TIMEZONE,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).formatToParts(booking.slotStart);
        const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
        const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
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

  /** Desk roles for any active doctor of the practice; a doctor for their own calendar. */
  async assertCanManageSlots(practiceId: string, actorUserId: string, providerId: string) {
    if (!isUuid(providerId)) throw new AppError(400, "Pick a doctor.");
    const member = await this.assertMember(practiceId, actorUserId);
    if (!DESK_ROLES.has(member.role) && providerId !== actorUserId) {
      throw new AppError(403, "Doctors can only add slots to their own calendar. Reception and clinic admins can add them for any doctor.");
    }
    const provider = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId, userId: providerId } },
      select: { isActive: true, user: { select: { name: true } } },
    });
    if (!provider?.isActive) throw new AppError(404, "That doctor is not active in this clinic.");
    return { member, providerName: provider.user?.name?.trim() || "the doctor" };
  },

  async loadDayWindows(practiceId: string, providerId: string, dateIso: string) {
    const date = parseLocalDate(dateIso);
    const [rows, overrides] = await Promise.all([
      loadSchedulesOn({ practiceId, providerId }, dateIso),
      prisma.scheduleOverride.findMany({
        where: { practiceId, providerId, date: startOfLocalDay(date) },
      }),
    ]);
    return dayWindows(rows, overrides, date);
  },

  /**
   * Quick-create bookable time from the calendar (EXTRA_SLOT override). Adds availability
   * only, so no patient is messaged.
   */
  async createExtraSlots(
    practiceId: string,
    providerId: string,
    data: { date: string; startTime?: string; endTime?: string; reason?: string },
    actorUserId: string,
  ) {
    const { providerName } = await this.assertCanManageSlots(practiceId, actorUserId, providerId);
    const dateIso = data.date?.trim();
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      throw new AppError(400, "Date must be YYYY-MM-DD.");
    }
    const today = todayIso();
    if (dateIso < today) throw new AppError(400, "That day has already passed.");
    if (dateIso > addDaysIso(today, 366)) {
      throw new AppError(400, "Slots can be added at most one year ahead.");
    }
    const startTime = data.startTime?.trim() ?? "";
    const endTime = data.endTime?.trim() ?? "";
    const day = await this.loadDayWindows(practiceId, providerId, dateIso);
    const check = checkExtraWindow(
      { start: startTime, end: endTime },
      day,
      dateIso === today ? clinicMinutesNow() : undefined,
    );
    if (!check.ok) throw new AppError(400, check.error);

    const override = await prisma.scheduleOverride.create({
      data: {
        practiceId,
        providerId,
        date: startOfLocalDay(parseLocalDate(dateIso)),
        type: OverrideType.EXTRA_SLOT,
        startTime,
        endTime,
        reason: data.reason?.trim().slice(0, 200) || null,
      },
    });
    console.log(
      `[calendar] extra slots ${dateIso} ${startTime}-${endTime} provider=${providerId} by=${actorUserId} slots=${check.slots}`,
    );
    return {
      ...override,
      slots: check.slots,
      slotIntervalMin: day.slotIntervalMin,
      message: `Added ${check.slots} bookable ${day.slotIntervalMin}-min slot${check.slots === 1 ? "" : "s"} for ${drName(providerName)}, ${hm12(startTime)}–${hm12(endTime)}.`,
    };
  },

  /** Remove a quick-created window; refused while any visit is booked inside it. */
  async deleteExtraSlots(practiceId: string, overrideId: string, actorUserId: string) {
    if (!isUuid(overrideId)) throw new AppError(400, "Invalid slot window.");
    const override = await prisma.scheduleOverride.findFirst({
      where: { id: overrideId, practiceId },
    });
    if (!override || override.type !== OverrideType.EXTRA_SLOT || !override.startTime || !override.endTime) {
      throw new AppError(404, "Those extra slots no longer exist.");
    }
    await this.assertCanManageSlots(practiceId, actorUserId, override.providerId);
    const dateIso = localDayOfSessionDate(override.date);
    const booked = await prisma.practiceBooking.count({
      where: {
        practiceId,
        providerId: override.providerId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        overrideSlot: false,
        slotStart: {
          gte: zonedDateTime(dateIso, override.startTime),
          lt: zonedDateTime(dateIso, override.endTime),
        },
      },
    });
    if (booked) {
      throw new AppError(
        409,
        `${booked} visit${booked === 1 ? " is" : "s are"} booked in these slots. Reschedule or cancel ${booked === 1 ? "it" : "them"} first.`,
      );
    }
    await prisma.scheduleOverride.delete({ where: { id: override.id } });
    console.log(
      `[calendar] extra slots removed ${dateIso} ${override.startTime}-${override.endTime} provider=${override.providerId} by=${actorUserId}`,
    );
    return { removed: true, message: `Removed extra slots ${hm12(override.startTime)}–${hm12(override.endTime)}.` };
  },

  async getSchedules(practiceId: string, providerId?: string, actorUserId?: string) {
    const scoped =
      actorUserId != null
        ? await this.resolveDataProviderScope(
            practiceId,
            actorUserId,
            providerId,
          )
        : providerId;
    if (scoped) {
      await this.applyDuePendingSchedule(scoped);
    } else {
      const providers = await prisma.providerSchedule.findMany({
        where: { practiceId, isActive: true },
        select: { providerId: true },
        distinct: ["providerId"],
      });
      await Promise.all(
        providers.map((p) => this.applyDuePendingSchedule(p.providerId)),
      );
    }
    const today = todayIso();
    const rows = await prisma.providerSchedule.findMany({
      where: {
        practiceId,
        ...(scoped ? { providerId: scoped } : {}),
        ...ACTIVE_VERSION,
        effectiveFrom: { lte: dbDate(today) },
      },
      include: { location: true },
    });
    const byProvider = new Map<string, typeof rows>();
    for (const r of rows) byProvider.set(r.providerId, [...(byProvider.get(r.providerId) ?? []), r]);
    return [...byProvider.values()].flatMap((list) => pickEffectiveVersion(list, today));
  },

  /** Saved schedule versions that start after today (oldest first). */
  async getUpcomingSchedules(practiceId: string, providerId: string) {
    const today = todayIso();
    const rows = await prisma.providerSchedule.findMany({
      where: { practiceId, providerId, ...ACTIVE_VERSION },
    });
    return upcomingVersionKeys(rows, today).map((key) => {
      const versionRows = rows.filter((r) => dateKey(r.effectiveFrom) === key);
      return { ...summarizeVersion(versionRows, key), locationId: versionRows[0]!.locationId };
    });
  },

  /** Next upcoming version that switches Time slots ↔ Token queue. */
  async getPendingModeChange(providerId: string, practiceId?: string) {
    await this.applyDuePendingSchedule(providerId);
    const today = todayIso();
    const rows = await prisma.providerSchedule.findMany({
      where: { providerId, ...ACTIVE_VERSION, ...(practiceId ? { practiceId } : {}) },
    });
    let mode = resolveProviderBookingMode(pickEffectiveVersion(rows, today));
    for (const key of upcomingVersionKeys(rows, today)) {
      const next = resolveProviderBookingMode(pickEffectiveVersion(rows, key));
      if (next && mode && next !== mode) {
        return { toMode: next, fromMode: mode, effectiveDate: key };
      }
      mode = next ?? mode;
    }
    return null;
  },

  /** Drop a saved version that hasn't started yet. */
  async cancelUpcomingSchedule(
    practiceId: string,
    providerId: string,
    effectiveFrom: string,
    actorUserId: string,
  ) {
    await this.assertCanManageProvider(practiceId, actorUserId, providerId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom ?? "")) {
      throw new AppError(400, "effectiveFrom must be YYYY-MM-DD.");
    }
    if (effectiveFrom <= todayIso()) {
      throw new AppError(409, "This schedule has already started. Save a new schedule instead.");
    }
    const res = await prisma.providerSchedule.deleteMany({
      where: {
        practiceId,
        providerId,
        effectiveFrom: dbDate(effectiveFrom),
        status: ScheduleVersionStatus.ACTIVE,
      },
    });
    if (!res.count) throw new AppError(404, "No scheduled change on that date.");
    console.log(`[schedule] upcoming version ${effectiveFrom} cancelled provider=${providerId} by=${actorUserId}`);
    return { cancelled: effectiveFrom };
  },

  async loadPendingVersion(practiceId: string, providerId: string) {
    const rows = await prisma.providerSchedule.findMany({
      where: {
        practiceId,
        providerId,
        isActive: true,
        status: ScheduleVersionStatus.PENDING_VERIFICATION,
      },
      orderBy: [{ createdAt: "desc" }, { dayOfWeek: "asc" }],
    });
    if (!rows.length) return null;
    const first = rows[0]!;
    const versionRows = rows
      .filter((r) => r.locationId === first.locationId)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    return {
      first,
      rows: versionRows,
      locationId: first.locationId,
      requestedFrom: dateKey(first.effectiveFrom),
      mode: resolveProviderBookingMode(versionRows) ?? ScheduleMode.TIME_BASED,
    };
  },

  /**
   * The version parked in PENDING_VERIFICATION (if any) with a live impact
   * assessment — conflicts shrink as the clinic reschedules / cancels visits.
   */
  async getPendingVerification(practiceId: string, providerId: string) {
    const pending = await this.loadPendingVersion(practiceId, providerId);
    if (!pending) return null;
    const [plan, submitter, heldAlerts] = await Promise.all([
      this.planVersionStart(
        practiceId,
        providerId,
        pending.locationId,
        pending.rows,
        pending.mode,
        pending.requestedFrom,
      ),
      pending.first.submittedById
        ? prisma.user.findUnique({
            where: { id: pending.first.submittedById },
            select: { name: true },
          })
        : null,
      ScheduleAlertService.countHeld(practiceId, providerId),
    ]);
    return {
      status: ScheduleVersionStatus.PENDING_VERIFICATION,
      effectiveFrom: plan.effectiveFrom,
      requestedFrom: pending.requestedFrom,
      minEffectiveFrom: plan.minIso,
      locationId: pending.locationId,
      summary: summarizeVersion(pending.rows, plan.effectiveFrom),
      submittedAt: pending.first.createdAt,
      submittedBy: submitter?.name ?? null,
      modeChanging: plan.modeChanging,
      conflicts: plan.conflicts,
      impact: summarizeImpact(plan.conflicts),
      safeEffectiveFrom: plan.safeEffectiveFrom,
      notice: plan.notice,
      /** Patient alerts from resolved visits, sent once every clash is resolved. */
      heldAlerts,
    };
  },

  /**
   * Verify a pending version: make it the active schedule from `effectiveFrom`
   * (default its requested date, never before today / tomorrow for a mode
   * switch). Clashing visits stay booked; the result lists them.
   */
  async activatePendingSchedule(
    practiceId: string,
    providerId: string,
    actorUserId: string,
    requestedFrom?: string | null,
  ) {
    await this.assertCanManageProvider(practiceId, actorUserId, providerId);
    const pending = await this.loadPendingVersion(practiceId, providerId);
    if (!pending) throw new AppError(404, "No schedule is waiting for verification.");
    const plan = await this.planVersionStart(
      practiceId,
      providerId,
      pending.locationId,
      pending.rows,
      pending.mode,
      requestedFrom || pending.requestedFrom,
    );
    const conflicts: ScheduleConflict[] = plan.conflicts;
    const summary = summarizeVersion(pending.rows, plan.effectiveFrom);
    const startsToday = plan.effectiveFrom <= todayIso();

    await prisma.$transaction(async (tx) => {
      await this.writeScheduleVersion(tx, {
        practiceId,
        providerId,
        locationId: pending.locationId,
        rows: pending.rows.map(toRowInput),
        effectiveFrom: plan.effectiveFrom,
        actorUserId,
        pending: false,
      });
      if (startsToday && summary.startTime && summary.endTime) {
        await tx.doctor.updateMany({
          where: { id: providerId },
          data: {
            availableTimes: `${summary.workingDays.join(",")}|${summary.startTime}-${summary.endTime}`,
          },
        });
      }
    });
    console.log(
      `[schedule] pending version activated from ${plan.effectiveFrom} provider=${providerId} by=${actorUserId} conflicts=${conflicts.length}`,
    );
    await this.clearRedundantOverrides(practiceId, providerId, pending.locationId);
    // Clashes are settled now: visits still outside the schedule get a
    // "pick a new time" request, and alerts held during resolution go out.
    await ScheduleAlertService.holdAskToReschedule(
      practiceId,
      providerId,
      conflicts.map((c) => ({ bookingId: c.bookingId, oldWhen: c.when })),
      actorUserId,
    );
    const alerts = await ScheduleAlertService.dispatch({ practiceId, providerId });

    if (plan.modeChanging && plan.currentMode) {
      const provider = await prisma.user.findUnique({
        where: { id: providerId },
        select: { name: true },
      });
      void this.notifyBookingModeChange({
        practiceId,
        providerId,
        providerName: provider?.name ?? null,
        fromMode: plan.currentMode,
        toMode: pending.mode,
        effectiveDate: plan.effectiveFrom,
      }).catch((err) => console.warn("mode-change notification skipped:", err));
    }

    const n = conflicts.length;
    const informed = alerts.sent - (alerts.byKind.ASK_TO_RESCHEDULE ?? 0);
    return {
      effectiveFrom: plan.effectiveFrom,
      conflicts,
      impact: summarizeImpact(conflicts),
      alerts,
      message:
        `New schedule is active from ${plan.effectiveFrom}.` +
        (n
          ? ` ${n} booked appointment${n === 1 ? " is" : "s are"} outside it and stay${n === 1 ? "s" : ""} booked; ${n === 1 ? "that patient was" : "those patients were"} asked on WhatsApp / email to pick a new time or cancel.`
          : "") +
        (informed > 0
          ? ` ${informed} patient${informed === 1 ? " was" : "s were"} told about their updated appointment.`
          : "") +
        noticeNote(plan.notice, plan.effectiveFrom),
    };
  },

  /** Throw away the pending version; the current schedule is unchanged. */
  async discardPendingSchedule(practiceId: string, providerId: string, actorUserId: string) {
    await this.assertCanManageProvider(practiceId, actorUserId, providerId);
    const pending = await this.loadPendingVersion(practiceId, providerId);
    const res = await prisma.providerSchedule.deleteMany({
      where: { practiceId, providerId, status: ScheduleVersionStatus.PENDING_VERIFICATION },
    });
    if (!res.count) throw new AppError(404, "No schedule is waiting for verification.");
    console.log(`[schedule] pending version discarded provider=${providerId} by=${actorUserId}`);
    if (pending) await this.clearRedundantOverrides(practiceId, providerId, pending.locationId);
    // Visits already moved / cancelled stay that way — their patients must hear about it.
    const alerts = await ScheduleAlertService.dispatch({ practiceId, providerId });
    return { discarded: true, alerts };
  },

  /**
   * Drop the Override-slot flag from upcoming visits the active schedule now
   * offers anyway (e.g. kept for a pending version that was discarded).
   */
  async clearRedundantOverrides(practiceId: string, providerId: string, locationId: string) {
    const kept = await prisma.practiceBooking.findMany({
      where: {
        practiceId,
        providerId,
        locationId,
        overrideSlot: true,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      select: { id: true, mode: true, slotStart: true, sessionDate: true, tokenNumber: true },
    });
    if (!kept.length) return 0;
    const rows = await prisma.providerSchedule.findMany({
      where: { practiceId, providerId, locationId, ...ACTIVE_VERSION },
    });
    const fits = kept.filter((b) => {
      const day = bookingDayIso(b);
      return day != null && bookingFitsSchedule(b, pickEffectiveVersion(rows, day));
    });
    if (fits.length) {
      await prisma.practiceBooking.updateMany({
        where: { id: { in: fits.map((b) => b.id) } },
        data: { overrideSlot: false, overrideNote: null },
      });
    }
    return fits.length;
  },

  async getOverrides(
    practiceId: string,
    providerId?: string,
    date?: string,
    actorUserId?: string,
  ) {
    const scoped =
      actorUserId != null
        ? await this.resolveDataProviderScope(
            practiceId,
            actorUserId,
            providerId,
          )
        : providerId;
    const rows = await prisma.scheduleOverride.findMany({
      where: {
        practiceId,
        ...(scoped ? { providerId: scoped } : {}),
        ...(date ? { date: startOfLocalDay(parseLocalDate(date)) } : {}),
      },
      orderBy: { date: "desc" },
    });
    return rows.map((o) => ({ ...o, day: localDayOfSessionDate(o.date) }));
  },

  async updatePractice(
    practiceId: string,
    data: {
      name?: string;
      specialty?: string;
      consultationFee?: number;
      advanceBookingAmount?: number | string | null;
      scheduleNoticeHours?: number | string;
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
    await this.assertProfileEditor(practiceId, actorUserId);

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

    let nextAdvance: number | null | undefined;
    if (data.advanceBookingAmount !== undefined) {
      const raw = data.advanceBookingAmount;
      if (raw === null || String(raw).trim() === "") {
        nextAdvance = null;
      } else {
        const adv = Number(raw);
        if (!Number.isFinite(adv) || adv < 1 || adv > 100000) {
          throw new AppError(
            400,
            "Advance booking amount must be between ₹1 and ₹1,00,000 (leave it empty to ask for the full fee).",
          );
        }
        nextAdvance = Math.round(adv * 100) / 100;
      }
    }

    let nextNotice: number | undefined;
    if (data.scheduleNoticeHours !== undefined) {
      const hours = Number(data.scheduleNoticeHours);
      if (!(NOTICE_HOURS_OPTIONS as readonly number[]).includes(hours)) {
        throw new AppError(400, "Schedule change notice must be 24, 48 or 72 hours, or 7 days.");
      }
      nextNotice = hours;
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
          ...(nextAdvance !== undefined
            ? { advanceBookingAmount: nextAdvance }
            : {}),
          ...(nextNotice !== undefined ? { scheduleNoticeHours: nextNotice } : {}),
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
    }).then((updated) => {
      clearMineCacheFor(actorUserId);
      for (const m of updated.members) clearMineCacheFor(m.userId);
      return updated;
    });
  },

  async getForUser(userId: string) {
    const cached = mineCache.get(userId);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    const data = await this.getForUserUncached(userId);
    mineCache.set(userId, { data, expires: Date.now() + MINE_CACHE_TTL_MS });
    if (mineCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of mineCache) {
        if (v.expires <= now) mineCache.delete(k);
      }
    }
    return data;
  },

  async getForUserUncached(userId: string) {
    const rows = await prisma.practiceMember.findMany({
      where: { userId, isActive: true },
      include: {
        practice: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            specialty: true,
            consultationFee: true,
            advanceBookingAmount: true,
            scheduleNoticeHours: true,
            registrationNo: true,
            phone: true,
            email: true,
            whatsappBusinessNumber: true,
            isDirectoryListed: true,
            bgSrc: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            locations: {
              where: { isActive: true },
              select: {
                id: true,
                name: true,
                city: true,
                address: true,
                isActive: true,
              },
            },
            members: {
              where: { isActive: true },
              select: {
                id: true,
                role: true,
                userId: true,
                doctorId: true,
                isActive: true,
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

    return rows.map((row) => {
      const isAdmin =
        row.role === "PRACTICE_OWNER" || row.role === "PRACTICE_ADMIN";
      // Staff doctors must not receive other clinic doctors' PII in the roster.
      const practice = isAdmin
        ? row.practice
        : {
            ...row.practice,
            members: row.practice.members.filter((m) => m.userId === userId),
          };
      return {
        ...row,
        practice,
        membershipId: row.id,
        id: row.practiceId,
        practiceId: row.practiceId,
      };
    });
  },

  /** One round-trip for doctor queue/dashboard: memberships + today's bookings. */
  async getDashboardBootstrap(
    userId: string,
    opts?: {
      date?: string;
      from?: string;
      to?: string;
      includePatients?: boolean;
    },
  ) {
    const memberships = (await this.getForUser(userId)) as Array<{
      practiceId?: string;
      practice?: { id?: string };
    }>;
    const first = memberships[0];
    const practiceId = first?.practiceId || first?.practice?.id;
    if (!practiceId) {
      return {
        memberships,
        bookings: [] as unknown[],
        patients: [] as unknown[],
      };
    }
    const providerScope = await this.resolveDataProviderScope(
      practiceId,
      userId,
    );
    const { BookingService } = await import("./booking.service.js");
    const includePatients = opts?.includePatients !== false;
    const [bookings, patients] = await Promise.all([
      BookingService.listForPractice(practiceId, {
        date: opts?.date,
        from: opts?.from,
        to: opts?.to,
        providerId: providerScope,
      }),
      includePatients
        ? this.listPatients(practiceId, userId)
        : Promise.resolve([]),
    ]);
    return { memberships, practiceId, bookings, patients };
  },

  /** Validate the provider settings form and build one weekly schedule version (rows without a date). */
  buildProviderScheduleVersion(
    practiceId: string,
    providerId: string,
    data: ProviderScheduleForm,
  ) {
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
    const patientsPerSlot = isTime
      ? 1
      : Math.min(50, Math.max(1, Number(data.patientsPerSlot) || 1));
    const workSpan = minutesOf(data.endTime) - minutesOf(data.startTime);
    const maxTokens = isTime
      ? null
      : Math.max(
          patientsPerSlot,
          Math.floor((workSpan / slotMins) * patientsPerSlot),
        );

    const rows = workingDays.map((dayOfWeek) => ({
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
    return { mode, rows, workingDays };
  },

  /**
   * Start date for a new version. Switching Time slots ↔ Token queue can't
   * start today (today's visits were booked under the current mode).
   */
  async planScheduleEffectiveFrom(
    practiceId: string,
    providerId: string,
    locationId: string,
    nextMode: ScheduleMode,
    requested?: string | null,
  ) {
    const today = todayIso();
    const current = await loadSchedulesOn({ practiceId, providerId, locationId }, today);
    const currentMode = resolveProviderBookingMode(current);
    const modeChanging = currentMode != null && currentMode !== nextMode;
    const minIso = modeChanging ? addDaysIso(today, 1) : today;
    return {
      effectiveFrom: this.resolveEffectiveFrom(requested, minIso),
      minIso,
      currentMode,
      modeChanging,
    };
  },

  async scheduleNoticeHours(practiceId: string): Promise<number> {
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { scheduleNoticeHours: true },
    });
    return normalizeNoticeHours(practice?.scheduleNoticeHours);
  },

  /**
   * Start date and impact of a version: the requested date (never before today,
   * or tomorrow for a mode switch), moved past any booked visit inside the
   * clinic's notice period that it would affect. Changes that affect nobody
   * keep the requested date.
   */
  async planVersionStart(
    practiceId: string,
    providerId: string,
    locationId: string,
    rows: Parameters<typeof findConflicts>[2],
    nextMode: ScheduleMode,
    requested?: string | null,
  ) {
    const [plan, hours] = await Promise.all([
      this.planScheduleEffectiveFrom(practiceId, providerId, locationId, nextMode, requested),
      this.scheduleNoticeHours(practiceId),
    ]);
    const all = await this.scheduleConflicts(practiceId, providerId, locationId, rows, plan.minIso);
    const endsAt = noticeEndsAt(hours);
    const { effectiveFrom, blockedBy } = applyNoticePeriod(all, plan.effectiveFrom, endsAt);
    return {
      ...plan,
      effectiveFrom,
      all,
      conflicts: all.filter((c) => c.day >= effectiveFrom),
      safeEffectiveFrom: earliestSafeDate(all, effectiveFrom),
      notice: {
        hours,
        endsAt: endsAt.toISOString(),
        requestedFrom: plan.effectiveFrom,
        adjusted: effectiveFrom !== plan.effectiveFrom,
        blockedBy,
      },
    };
  },

  /** Upcoming active bookings (from `fromIso`) that the proposed version would no longer offer. */
  async scheduleConflicts(
    practiceId: string,
    providerId: string,
    locationId: string,
    nextRows: Parameters<typeof findConflicts>[2],
    fromIso: string,
  ) {
    const [bookings, currentRows] = await Promise.all([
      prisma.practiceBooking.findMany({
        where: {
          practiceId,
          providerId,
          locationId,
          status: { in: ACTIVE_BOOKING_STATUSES },
          overrideSlot: false,
          OR: [
            { slotStart: { gte: parseLocalDate(fromIso) } },
            { sessionDate: { gte: parseLocalDate(addDaysIso(fromIso, -1)) } },
          ],
        },
        select: {
          id: true,
          patientName: true,
          locationId: true,
          mode: true,
          slotStart: true,
          sessionDate: true,
          tokenNumber: true,
        },
        take: 2000,
      }),
      prisma.providerSchedule.findMany({
        where: { practiceId, providerId, locationId, ...ACTIVE_VERSION },
      }),
    ]);
    return findConflicts(bookings, currentRows, nextRows, fromIso);
  },

  /**
   * Dry run of a settings save: which upcoming appointments would fall outside
   * the new schedule, and the first start date that affects none of them.
   * Nothing is written and no booking is changed.
   */
  async previewProviderSettings(
    practiceId: string,
    providerId: string,
    data: ProviderScheduleForm,
    actorUserId: string,
  ) {
    await this.assertCanManageProvider(practiceId, actorUserId, providerId);
    const built = this.buildProviderScheduleVersion(practiceId, providerId, data);
    const plan = await this.planVersionStart(
      practiceId,
      providerId,
      data.locationId,
      built.rows,
      built.mode,
      data.effectiveFrom,
    );
    return {
      effectiveFrom: plan.effectiveFrom,
      minEffectiveFrom: plan.minIso,
      modeChanging: plan.modeChanging,
      conflicts: plan.conflicts,
      impact: summarizeImpact(plan.conflicts),
      /** Saving as-is would park the version in PENDING_VERIFICATION. */
      wouldBePending: plan.conflicts.length > 0,
      safeEffectiveFrom: plan.safeEffectiveFrom,
      notice: plan.notice,
    };
  },

  /**
   * Save the settings form as a new schedule version starting `effectiveFrom`
   * (default: today, or tomorrow for a Time ↔ Token switch). Days before it keep
   * the version they were booked under; versions starting on/after it are replaced.
   * Existing bookings are never modified.
   */
  async syncProviderSettings(
    practiceId: string,
    providerId: string,
    data: ProviderScheduleForm & {
      name?: string;
      licenseNo?: string;
      appointmentValidityDays?: number;
    },
    actorUserId: string,
  ) {
    await this.assertCanManageProvider(practiceId, actorUserId, providerId);
    await this.applyDuePendingSchedule(providerId);

    const built = this.buildProviderScheduleVersion(practiceId, providerId, data);
    const plan = await this.planVersionStart(
      practiceId,
      providerId,
      data.locationId,
      built.rows,
      built.mode,
      data.effectiveFrom,
    );
    const effectiveFrom = plan.effectiveFrom;
    const today = todayIso();
    const conflicts = plan.conflicts;
    const pending = conflicts.length > 0;
    const noticeText = noticeNote(plan.notice, effectiveFrom);
    const startsToday = !pending && effectiveFrom <= today;

    const licenseNo = data.licenseNo?.trim();
    const name = data.name?.trim();
    const validity =
      data.appointmentValidityDays != null
        ? Math.min(90, Math.max(1, Number(data.appointmentValidityDays) || 7))
        : undefined;

    const provider = await prisma.$transaction(async (tx) => {
      await Promise.all([
        name
          ? tx.user.update({ where: { id: providerId }, data: { name } })
          : Promise.resolve(),
        tx.doctor.updateMany({
          where: { id: providerId },
          data: {
            ...(licenseNo ? { licenseNo } : {}),
            ...(validity != null ? { appointmentValidityDays: validity } : {}),
            ...(startsToday
              ? { availableTimes: `${built.workingDays.join(",")}|${data.startTime}-${data.endTime}` }
              : {}),
            pendingSchedule: Prisma.JsonNull,
            pendingScheduleEffective: null,
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

      await this.writeScheduleVersion(tx, {
        practiceId,
        providerId,
        locationId: data.locationId,
        rows: built.rows,
        effectiveFrom,
        actorUserId,
        pending,
      });

      return tx.user.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          name: true,
          email: true,
          doctor: {
            select: {
              licenseNo: true,
              appointmentValidityDays: true,
              pendingSchedule: true,
              pendingScheduleEffective: true,
            },
          },
        },
      });
    });

    const [schedules, upcomingChanges, pendingVerification] = await Promise.all([
      loadSchedulesOn({ practiceId, providerId, locationId: data.locationId }, today).then(
        (rows) => rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
      ),
      this.getUpcomingSchedules(practiceId, providerId),
      pending ? this.getPendingVerification(practiceId, providerId) : Promise.resolve(null),
    ]);
    const activeMode = resolveProviderBookingMode(schedules) ?? built.mode;

    if (pending) {
      const impact = summarizeImpact(conflicts);
      return {
        schedules,
        provider,
        status: ScheduleVersionStatus.PENDING_VERIFICATION,
        effectiveFrom,
        scheduledChange: false,
        upcomingChanges,
        pendingVerification,
        conflicts,
        impact,
        modeChangeDeferred: false,
        modeChangeEffectiveDate: null,
        pendingMode: null,
        activeMode,
        notice: plan.notice,
        message: `Profile saved. The new schedule from ${effectiveFrom} clashes with ${impact.total} booked appointment${impact.total === 1 ? "" : "s"}, so it is saved as Pending verification — the current schedule stays in force and no appointment was changed. Review and activate it when ready.${noticeText}`,
      };
    }

    if (plan.modeChanging) {
      void this.notifyBookingModeChange({
        practiceId,
        providerId,
        providerName: provider?.name ?? null,
        fromMode: plan.currentMode!,
        toMode: built.mode,
        effectiveDate: effectiveFrom,
      }).catch((err) =>
        console.warn("mode-change notification skipped:", err),
      );
    }

    const modeLabel = built.mode === ScheduleMode.TOKEN_BASED ? "Token queue" : "Time slots";
    return {
      schedules,
      provider,
      status: ScheduleVersionStatus.ACTIVE,
      effectiveFrom,
      scheduledChange: !startsToday,
      upcomingChanges,
      pendingVerification: null,
      conflicts,
      impact: summarizeImpact(conflicts),
      modeChangeDeferred: plan.modeChanging,
      modeChangeEffectiveDate: plan.modeChanging ? effectiveFrom : null,
      pendingMode: plan.modeChanging ? built.mode : null,
      activeMode,
      notice: plan.notice,
      message:
        (plan.modeChanging
          ? `Booking type switch to ${modeLabel} is scheduled from ${effectiveFrom}. Appointments before that keep the current mode.`
          : startsToday
            ? "Provider settings saved."
            : `New schedule saved. It applies from ${effectiveFrom}; days before that keep the current schedule.`) +
        noticeText,
    };
  },

  /**
   * Legacy: turn a pre-versioning deferred switch (`Doctor.pendingSchedule`)
   * into a schedule version at its effective date.
   */
  async applyDuePendingSchedule(providerId: string) {
    const doctor = await prisma.doctor.findUnique({
      where: { id: providerId },
      select: {
        pendingSchedule: true,
        pendingScheduleEffective: true,
      },
    });
    if (!doctor?.pendingSchedule || !doctor.pendingScheduleEffective) return false;

    const clear = () =>
      prisma.doctor.update({
        where: { id: providerId },
        data: { pendingSchedule: Prisma.JsonNull, pendingScheduleEffective: null },
      });

    const pending = doctor.pendingSchedule as Partial<ProviderScheduleForm>;
    const locationId = pending.locationId?.trim();
    const membership = await prisma.practiceMember.findFirst({
      where: { userId: providerId, isActive: true },
      select: { practiceId: true },
    });
    if (!membership) return false;
    if (!locationId || !pending.startTime || !pending.endTime) {
      await clear();
      return false;
    }

    const built = (() => {
      try {
        return this.buildProviderScheduleVersion(membership.practiceId, providerId, {
        locationId,
        bookingType: pending.bookingType ?? "TIME",
        workingDays: pending.workingDays ?? [],
        startTime: pending.startTime,
        endTime: pending.endTime,
        breakStartTime: pending.breakStartTime,
        breakEndTime: pending.breakEndTime,
        slotDurationMins: pending.slotDurationMins,
        patientsPerSlot: pending.patientsPerSlot,
        });
      } catch {
        return null;
      }
    })();
    if (!built) {
      await clear();
      return false;
    }

    const legacyDay = localDayOfSessionDate(doctor.pendingScheduleEffective);
    const today = todayIso();
    const effectiveFrom = legacyDay > today ? legacyDay : today;

    await prisma.$transaction(async (tx) => {
      await tx.providerSchedule.deleteMany({
        where: {
          practiceId: membership.practiceId,
          providerId,
          locationId,
          status: ScheduleVersionStatus.ACTIVE,
          effectiveFrom: { gte: dbDate(effectiveFrom) },
        },
      });
      await tx.providerSchedule.createMany({
        data: built.rows.map((r) => ({ ...r, effectiveFrom: dbDate(effectiveFrom) })),
      });
      await tx.doctor.update({
        where: { id: providerId },
        data: { pendingSchedule: Prisma.JsonNull, pendingScheduleEffective: null },
      });
    });
    return true;
  },

  async notifyBookingModeChange(opts: {
    practiceId: string;
    providerId: string;
    providerName: string | null;
    fromMode: ScheduleMode;
    toMode: ScheduleMode;
    effectiveDate: string;
  }) {
    const booking = await prisma.practiceBooking.findFirst({
      where: {
        practiceId: opts.practiceId,
        providerId: opts.providerId,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!booking) return null;

    const { NotificationService } = await import("./notification.service.js");
    const label = (m: ScheduleMode) =>
      m === ScheduleMode.TOKEN_BASED ? "Token queue" : "Time slots";
    return NotificationService.enqueueClinicModeChange({
      practiceId: opts.practiceId,
      bookingId: booking.id,
      providerName: opts.providerName,
      fromLabel: label(opts.fromMode),
      toLabel: label(opts.toMode),
      effectiveDate: opts.effectiveDate,
    });
  },

  async getCalendar(
    practiceId: string,
    providerId: string,
    dateStr: string,
    actorUserId: string,
  ) {
    const member = await this.assertMember(practiceId, actorUserId);
    if (!DESK_ROLES.has(member.role) && providerId !== actorUserId) {
      throw new AppError(403, "Clinic staff doctors can only view their own calendar.");
    }
    await this.applyDuePendingSchedule(providerId);
    const date = parseLocalDate(dateStr);
    const dayOfWeek = practiceWeekday(date);
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);

    const [allRows, bookings, overrides] = await Promise.all([
      loadSchedulesOn({ practiceId, providerId }, formatLocalDate(date)),
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

    const activeRows = schedulesForActiveMode(allRows);
    const configuredMode = resolveProviderBookingMode(allRows);
    const activeSchedules = activeRows.filter((s) => s.dayOfWeek === dayOfWeek);

    const timeSlots = timeSlotsForProviderDay(activeRows, date, bookings, overrides);

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
      windows: dayWindows(allRows, overrides, date),
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
    const scopedProviderId = await this.resolveDataProviderScope(
      practiceId,
      actorUserId,
      providerId,
    );

    // Do not call ensureDefaultPlans() here — it is a seed/admin path and
    // was adding multi-second latency to every dashboard chart load.
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
      scopedProviderId && isUuid(scopedProviderId)
        ? scopedProviderId
        : undefined;

    type Bucket = {
      label: string;
      start: Date;
      end: Date;
      prevStart?: Date;
      prevEnd?: Date;
    };

    const today = new Date();
    const todayIso = formatLocalDate(today);
    const [yearStr, monthStr] = todayIso.split("-");
    const currentYear = Number(yearStr);
    const currentMonth = Number(monthStr); // 1–12 in practice TZ
    let buckets: Bucket[] = [];

    const shiftIso = (iso: string, days: number) => {
      const [y, m, d] = iso.split("-").map(Number);
      const utc = new Date(Date.UTC(y, m - 1, d + days));
      return utc.toISOString().slice(0, 10);
    };

    if (normalized === "day") {
      buckets = Array.from({ length: 24 }, (_, h) => {
        const hh = String(h).padStart(2, "0");
        const start = zonedDateTime(todayIso, `${hh}:00`);
        const end =
          h < 23
            ? new Date(
                zonedDateTime(
                  todayIso,
                  `${String(h + 1).padStart(2, "0")}:00`,
                ).getTime() - 1,
              )
            : endOfLocalDay(parseLocalDate(todayIso));
        return {
          label: `${hh}:00`,
          start,
          end,
        };
      });
    } else if (normalized === "week") {
      const weekStartIso = shiftIso(todayIso, -practiceWeekday(today));
      buckets = Array.from({ length: 7 }, (_, i) => {
        const dayIso = shiftIso(weekStartIso, i);
        const start = parseLocalDate(dayIso);
        const end = endOfLocalDay(start);
        return {
          label: start.toLocaleDateString("en-US", {
            weekday: "long",
            timeZone: PRACTICE_TIMEZONE,
          }),
          start,
          end,
        };
      });
    } else if (normalized === "month") {
      const daysInMonth = new Date(
        Date.UTC(currentYear, currentMonth, 0),
      ).getUTCDate();
      buckets = Array.from({ length: daysInMonth }, (_, i) => {
        const dayIso = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
        const start = parseLocalDate(dayIso);
        return {
          label: String(i + 1),
          start,
          end: endOfLocalDay(start),
        };
      });
    } else {
      buckets = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const startIso = `${currentYear}-${String(month).padStart(2, "0")}-01`;
        const start = parseLocalDate(startIso);
        const lastDay = new Date(Date.UTC(currentYear, month, 0)).getUTCDate();
        const endIso = `${currentYear}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const end = endOfLocalDay(parseLocalDate(endIso));
        const prevStartIso = `${currentYear - 1}-${String(month).padStart(2, "0")}-01`;
        const prevLast = new Date(
          Date.UTC(currentYear - 1, month, 0),
        ).getUTCDate();
        const prevEndIso = `${currentYear - 1}-${String(month).padStart(2, "0")}-${String(prevLast).padStart(2, "0")}`;
        return {
          label: start.toLocaleDateString("en-US", {
            month: "long",
            timeZone: PRACTICE_TIMEZONE,
          }),
          start,
          end,
          prevStart: parseLocalDate(prevStartIso),
          prevEnd: endOfLocalDay(parseLocalDate(prevEndIso)),
        };
      });
    }

    type Cell = {
      patients: Record<string, number>;
      appointments: Record<string, number>;
      status: { completed: number; cancelled: number; rescheduled: number };
      compare?: {
        patients: Record<string, number>;
        appointments: Record<string, number>;
        status: { completed: number; cancelled: number; rescheduled: number };
      };
    };

    const result: Record<string, Cell> = {};
    for (const b of buckets) {
      result[b.label] = {
        patients: emptyGenderCounts(),
        appointments: emptyGenderCounts(),
        status: emptyStatusCounts(),
        ...(normalized === "yoy"
          ? {
              compare: {
                patients: emptyGenderCounts(),
                appointments: emptyGenderCounts(),
                status: emptyStatusCounts(),
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
        id: true,
        patientPhone: true,
        patientId: true,
        providerId: true,
        status: true,
        slotStart: true,
        sessionDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    let rescheduleEvents: Array<{ createdAt: Date; bookingId: string }> = [];
    try {
      rescheduleEvents = await prisma.notificationEvent.findMany({
        where: {
          practiceId,
          type: "RESCHEDULE",
          createdAt: { gte: fetchStart, lte: fetchEnd },
          ...(providerFilter
            ? { booking: { providerId: providerFilter } }
            : {}),
        },
        select: { createdAt: true, bookingId: true },
      });
    } catch (err) {
      console.warn(
        "[analytics] reschedule series skipped:",
        err instanceof Error ? err.message : err,
      );
    }

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
        if (b.status === BookingStatus.CANCELED) continue;
        const g = genderOf(b);
        dest.appointments[g] += 1;
        const phoneKey = last10Digits(b.patientPhone) || b.patientPhone;
        if (!seen[g].has(phoneKey)) {
          seen[g].add(phoneKey);
          dest.patients[g] += 1;
        }
      }
    }

    function accumulateStatus(
      cell: Cell,
      list: typeof bookings,
      reschedules: typeof rescheduleEvents,
      target: "main" | "compare",
    ) {
      const dest =
        target === "compare" && cell.compare ? cell.compare : cell;
      for (const b of list) {
        if (b.status === BookingStatus.COMPLETED) dest.status.completed += 1;
        else if (b.status === BookingStatus.CANCELED) dest.status.cancelled += 1;
      }
      dest.status.rescheduled += reschedules.length;
    }

    for (const b of buckets) {
      const inBucket = bookings.filter((row) => {
        const at = bookingAt(row).getTime();
        return at >= b.start.getTime() && at <= b.end.getTime();
      });
      accumulate(result[b.label], inBucket, "main");
      const reschedulesInBucket = rescheduleEvents.filter((n) => {
        const t = n.createdAt.getTime();
        return t >= b.start.getTime() && t <= b.end.getTime();
      });
      accumulateStatus(result[b.label], inBucket, reschedulesInBucket, "main");

      if (normalized === "yoy" && b.prevStart && b.prevEnd) {
        const prev = bookings.filter((row) => {
          const at = bookingAt(row).getTime();
          return at >= b.prevStart!.getTime() && at <= b.prevEnd!.getTime();
        });
        accumulate(result[b.label], prev, "compare");
        const prevReschedules = rescheduleEvents.filter((n) => {
          const t = n.createdAt.getTime();
          return t >= b.prevStart!.getTime() && t <= b.prevEnd!.getTime();
        });
        accumulateStatus(result[b.label], prev, prevReschedules, "compare");
      }
    }

    // Period for byDoctor = current range only (not YoY compare range)
    const periodBookings = bookings.filter((row) => {
      if (row.status === BookingStatus.CANCELED) return false;
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

    // Also count canceled in period for by-doctor table
    const canceledInPeriod = await prisma.practiceBooking.groupBy({
      by: ["providerId"],
      where: {
        practiceId,
        status: BookingStatus.CANCELED,
        ...(providerFilter ? { providerId: providerFilter } : {}),
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
