import { isUuid } from "../../core/params.js";
import {
  BookingChannel,
  BookingStatus,
  ScheduleMode,
  Prisma,
  type ProviderSchedule,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError, ResponseHandler } from "../../core/response.js";
import { ageFromDob } from "../../core/dob.js";
import { samePatientMobile } from "../../core/phoneMatch.js";
import {
  publicPatientAddress,
  publicPatientEmail,
} from "../../core/patientDisplay.js";
import {
  assignNextToken,
  countBookingsForSlot,
  endOfLocalDay,
  formatLocalDate,
  formatPracticeTime,
  isClinicDayAfterToday,
  getTokenSession,
  getValidityBounds,
  hasExtraSlotsForDay,
  isBookingStillUpcoming,
  isDateWithinValidity,
  isSlotStartBookable,
  parseLocalDate,
  PATIENT_BOOKING_HORIZON_DAYS,
  practiceWeekday,
  formatPracticeDateTime,
  resolveProviderBookingMode,
  sameLocalSlot,
  schedulesForActiveMode,
  startOfLocalDay,
  TIME_SLOT_CAPACITY,
  timeSlotsForProviderDay,
} from "./slotEngine.js";
import { arrivalPatch } from "./bookingArrival.js";
import { explicitClinicLogTemplate } from "./clinicLogSend.js";
import { assertVisitStatusMove } from "./bookingStatusFlow.js";
import { loadSchedulesOn, localDayOfSessionDate } from "./scheduleVersions.js";
import { NotificationService } from "./notification.service.js";
import { broadcastProctoEvent, serializeBooking } from "./proctoSocket.js";

const BOOKING_STATUSES = new Set<string>(Object.values(BookingStatus));
const BOOKING_CHANNELS = new Set<string>(Object.values(BookingChannel));

/**
 * Serialize concurrent book/reschedule for the same doctor + clock slot.
 * Lock is held until the transaction commits/rolls back.
 */
async function lockProviderTimeSlot(
  tx: Prisma.TransactionClient,
  providerId: string,
  slotStart: Date,
): Promise<void> {
  // Key by clinic wall-clock minute so second/ms differences share one lock.
  const key = `${providerId}:${formatLocalDate(slotStart)} ${formatPracticeTime(slotStart)}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** `capacity` comes from the engine's slot: 1 in regular hours, more for a shared extra slot. */
/**
 * Walk contiguous available engine slots from `slotStart` until `durationMinutes`
 * is covered. One slot when duration is omitted or fits the first slot.
 */
function spanBookedWindow(
  slots: Array<{ start: Date; end: Date; available: boolean }>,
  slotStart: Date,
  durationMinutes?: number,
): { start: Date; end: Date } {
  const ordered = [...slots].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const i = ordered.findIndex((s) => sameLocalSlot(s.start, slotStart));
  const first = i >= 0 ? ordered[i] : undefined;
  if (!first?.available) {
    throw new AppError(409, "selected slot is not available.");
  }
  const one = (first.end.getTime() - first.start.getTime()) / 60_000;
  const requested = Number(durationMinutes);
  const want =
    Number.isFinite(requested) && requested > 0
      ? Math.min(240, Math.max(one, requested))
      : one;
  let end = first.end;
  for (
    let j = i + 1;
    (end.getTime() - first.start.getTime()) / 60_000 + 0.5 < want;
    j++
  ) {
    const next = ordered[j];
    if (!next?.available) {
      throw new AppError(
        409,
        "Not enough free consecutive slots for that duration.",
      );
    }
    if (Math.abs(next.start.getTime() - end.getTime()) > 1500) {
      throw new AppError(409, "Those slots are not consecutive.");
    }
    end = next.end;
  }
  return { start: first.start, end };
}

function assertTimeSlotExclusive(
  bookings: Array<{ mode: ScheduleMode; slotStart: Date | null }>,
  slotStart: Date,
  capacity: number = TIME_SLOT_CAPACITY,
): void {
  if (countBookingsForSlot(bookings, slotStart) >= Math.max(TIME_SLOT_CAPACITY, capacity)) {
    throw new AppError(
      409,
      "This time slot is already booked. Please pick another time.",
    );
  }
}

/** Accept common misspelling CANCELLED → CANCELED; reject unknown values with 400. */
export function parseBookingStatus(raw: unknown): BookingStatus {
  const value = String(raw ?? "").trim().toUpperCase();
  if (value === "CANCELLED") return BookingStatus.CANCELED;
  if (BOOKING_STATUSES.has(value)) return value as BookingStatus;
  throw new AppError(
    400,
    `Invalid booking status. Use one of: ${[...BOOKING_STATUSES].join(", ")}`,
  );
}

function parseBookingChannel(raw: unknown, fallback: BookingChannel): BookingChannel {
  if (raw == null || raw === "") return fallback;
  const value = String(raw).trim().toUpperCase();
  if (BOOKING_CHANNELS.has(value)) return value as BookingChannel;
  throw new AppError(
    400,
    `Invalid booking channel. Use one of: ${[...BOOKING_CHANNELS].join(", ")}`,
  );
}

function clip(value: unknown, max: number): string | undefined {
  const text = String(value ?? "").trim().slice(0, max);
  return text || undefined;
}

function normalizeMedicines(
  raw?: Array<{
    name?: string;
    amount?: string;
    dose?: string;
    doseUnit?: string;
    times?: string[];
    frequency?: string;
    strength?: string;
    route?: string;
    duration?: string;
    durationUnit?: string;
    startDate?: string;
    endDate?: string;
    instruction?: string;
  }> | null,
) {
  return (raw ?? [])
    .map((m) => {
      const dose = clip(m.dose, 40) || clip(m.amount, 40);
      const doseUnit = clip(m.doseUnit, 20);
      const frequency =
        clip(m.frequency, 40) ||
        (Array.isArray(m.times)
          ? m.times.map((t) => String(t).trim()).filter(Boolean).join(", ")
          : undefined);
      const amount = [dose, doseUnit].filter(Boolean).join(" ") || clip(m.amount, 40);
      return {
        name: String(m.name || "").trim().slice(0, 120),
        amount,
        times: frequency ? [frequency] : undefined,
        strength: clip(m.strength, 40),
        route: clip(m.route, 40),
        dose,
        doseUnit,
        frequency,
        duration: clip(m.duration, 20),
        durationUnit: clip(m.durationUnit, 20),
        startDate: clip(m.startDate, 10),
        endDate: clip(m.endDate, 10),
        instruction: clip(m.instruction, 200),
      };
    })
    .filter((m) => m.name.length > 0);
}

function normalizeBookingDocuments(
  raw?: Array<{ name?: string; url?: string; uploadedAt?: string }> | null,
) {
  return (raw ?? [])
    .map((d) => ({
      name: String(d.name || "").trim() || "Document",
      url: String(d.url || "").trim(),
      uploadedAt: d.uploadedAt || new Date().toISOString(),
    }))
    .filter((d) => d.url.length > 0);
}

const MAX_GENERAL_DOCUMENTS = 30;
const MAX_SHARED_VISIT_DOCUMENTS = 20;
export const EMERGENCY_WALK_IN = "EMERGENCY_WALK_IN";

export type CreateBookingInput = {
  practiceId: string;
  locationId: string;
  providerId: string;
  patientPhone: string;
  patientName?: string;
  patientId?: string;
  mode?: ScheduleMode;
  slotStart?: string;
  sessionDate?: string;
  consultationType?: string;
  channel?: BookingChannel;
  notes?: string;
  disease?: string;
  documents?: Array<{ name: string; url: string; uploadedAt?: string }>;
  /** WhatsApp bot will send a short session ack — skip duplicate patient template. */
  skipPatientNotification?: boolean;
  /**
   * Desk multi-slot: cover this many minutes from slotStart (contiguous free slots).
   * Omitted or shorter than one slot → a single slot.
   */
  durationMinutes?: number;
};

type DeskPatientRef = {
  patientId: string;
  patientPhone: string;
  patientName: string;
  mrn: string | null;
};

/** Registered patient picked at the desk; the typed mobile must match their record. */
async function loadDeskPatient(
  practiceId: string,
  rawPatientId: string | undefined,
  rawPhone: string | undefined,
  what: "walk-in" | "booking",
): Promise<DeskPatientRef> {
  const patientId = String(rawPatientId || "").trim();
  if (!isUuid(patientId)) {
    throw new AppError(
      400,
      `Search for the patient or register them first — every ${what} needs a Patient ID (MRN).`,
    );
  }
  const patient = await prisma.user.findFirst({
    where: { id: patientId, role: "user", patient: { isNot: null } },
    select: { name: true, phone: true, patient: { select: { mrn: true, contactNumber: true } } },
  });
  const typed = String(rawPhone || "").replace(/\D/g, "").slice(-10);
  const onRecord = [patient?.patient?.contactNumber, patient?.phone].map((p) =>
    String(p || "").replace(/\D/g, ""),
  );
  if (!patient || typed.length < 10 || !onRecord.some((p) => p.slice(-10) === typed)) {
    throw new AppError(400, "That patient record doesn't match. Search for the patient again.");
  }
  const { resolveWhatsAppMsisdn } = await import("../chat.whatsappFanout.js");
  const resolved = await resolveWhatsAppMsisdn(
    practiceId,
    patient.patient?.contactNumber,
    patient.phone,
    rawPhone,
  );
  const stored = onRecord.find((p) => p.length >= 10) ?? typed;
  return {
    patientId,
    patientPhone: resolved.length >= 11 ? resolved : stored,
    patientName: patient.name?.trim().slice(0, 120) || "Patient",
    mrn: patient.patient?.mrn ?? null,
  };
}

/** Active clinic member; a DOCTOR member may act only on their own list. */
async function assertDeskActor(
  practiceId: string,
  providerId: string,
  actorUserId: string,
  action: string,
) {
  const actor = await prisma.practiceMember.findUnique({
    where: { practiceId_userId: { practiceId, userId: actorUserId } },
    select: { role: true, isActive: true },
  });
  if (!actor?.isActive) ResponseHandler.noPermission("not authorized.");
  if (actor!.role === "DOCTOR" && providerId !== actorUserId) {
    throw new AppError(403, `Doctors can ${action} only for their own list.`);
  }
}

export const BookingService = {
  async createBooking(data: CreateBookingInput) {
    const channel = parseBookingChannel(
      data.channel,
      BookingChannel.WEB_PORTAL,
    );

    // Store full WhatsApp MSISDN when present (e.g. 9715… / 9198…);
    // bare 10-digit Indian mobiles stay as last-10 for legacy web OTP.
    const digits = data.patientPhone.replace(/\D/g, "");
    const patientPhone =
      digits.length >= 11 && digits.length <= 15
        ? digits
        : digits.slice(-10);
    if (patientPhone.length < 10) {
      throw new AppError(400, "patientPhone must be a valid mobile number.");
    }
    data = { ...data, patientPhone };

    const patientRow = isUuid(String(data.patientId || ""))
      ? await prisma.patient.findUnique({ where: { id: data.patientId! }, select: { id: true } })
      : null;
    if (!patientRow) {
      throw new AppError(
        400,
        "Every booking needs a registered patient (Patient ID / MRN). Sign in or register the patient first.",
      );
    }

    const { assertBookingQuota } = await import("./planEntitlements.js");
    await assertBookingQuota(data.practiceId);

    const practice = await prisma.practice.findUnique({
      where: { id: data.practiceId },
      select: { isActive: true, isDirectoryListed: true },
    });
    if (!practice?.isActive) {
      throw new AppError(403, "This clinic is not accepting bookings.");
    }
    // Public web bookings require a directory-listed practice (slug profile path)
    if (
      channel === BookingChannel.WEB_PORTAL &&
      !practice.isDirectoryListed
    ) {
      throw new AppError(
        403,
        "This clinic is not listed for public booking yet. Subscribe under Billing to go live.",
      );
    }

    if (!data.disease?.trim()) {
      throw new AppError(400, "Chief complaint is required.");
    }

    if (channel === BookingChannel.WHATSAPP_AI) {
      if (!data.patientId) {
        throw new AppError(
          403,
          "Register on WhatsApp with this number before booking.",
        );
      }
      const digits = data.patientPhone.replace(/\D/g, "").slice(-10);
      const patient = await prisma.patient.findUnique({
        where: { id: data.patientId },
        include: { user: { select: { phone: true, role: true } } },
      });
      if (!patient || patient.user.role !== "user") {
        throw new AppError(403, "Only registered patients can book via WhatsApp.");
      }
      const registered =
        (patient.contactNumber || "").replace(/\D/g, "").slice(-10) === digits ||
        (patient.user.phone || "").replace(/\D/g, "").slice(-10) === digits;
      if (!registered) {
        throw new AppError(
          403,
          "Bookings must use your registered WhatsApp number.",
        );
      }
    }

    // Infer mode when clients omit it (slotStart → TIME_BASED, sessionDate → TOKEN_BASED).
    let mode = data.mode as ScheduleMode | undefined;
    if (!mode) {
      if (data.slotStart) mode = ScheduleMode.TIME_BASED;
      else if (data.sessionDate) mode = ScheduleMode.TOKEN_BASED;
    }

    let date: Date;
    if (mode === ScheduleMode.TOKEN_BASED) {
      if (!data.sessionDate) {
        throw new AppError(400, "sessionDate is required for token booking.");
      }
      date = parseLocalDate(data.sessionDate);
    } else if (data.slotStart) {
      date = startOfLocalDay(new Date(data.slotStart));
      mode = mode ?? ScheduleMode.TIME_BASED;
    } else {
      throw new AppError(400, "slotStart is required for time-based booking.");
    }

    if (Number.isNaN(date.getTime())) {
      throw new AppError(400, "invalid booking date.");
    }
    if (!mode) {
      throw new AppError(400, "mode is required (TIME_BASED or TOKEN_BASED).");
    }

    const dayOfWeek = practiceWeekday(date);
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);

    // Parallel fetch: validity + schedule context + membership/location checks
    const [allSchedules, location, member] = await Promise.all([
      loadSchedulesOn(
        {
          practiceId: data.practiceId,
          providerId: data.providerId,
          locationId: data.locationId,
        },
        formatLocalDate(date),
      ),
      prisma.clinicLocation.findFirst({
        where: {
          id: data.locationId,
          practiceId: data.practiceId,
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.practiceMember.findFirst({
        where: {
          practiceId: data.practiceId,
          userId: data.providerId,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);

    if (!location) throw new AppError(400, "location does not belong to this practice.");
    if (!member) throw new AppError(400, "provider is not an active member of this practice.");

    const providerMode = resolveProviderBookingMode(allSchedules);
    if (providerMode && mode !== providerMode) {
      throw new AppError(
        400,
        providerMode === ScheduleMode.TIME_BASED
          ? "This doctor uses time slots only."
          : "This doctor uses token queue only.",
      );
    }

    const schedule = allSchedules.find(
      (s) => s.dayOfWeek === dayOfWeek && s.mode === mode,
    );

    if (!isDateWithinValidity(date, PATIENT_BOOKING_HORIZON_DAYS)) {
      throw new AppError(
        400,
        `appointments can only be booked within ${PATIENT_BOOKING_HORIZON_DAYS} days`,
      );
    }

    if (!schedule && mode === ScheduleMode.TOKEN_BASED) {
      throw new AppError(404, "no schedule configured for this day.");
    }

    const diseaseText = data.disease?.trim().slice(0, 500) || "";
    // Store patient-provided reason only when they actually entered one.
    // Do not invent "General consultation" or auto-generate AI visit briefs.
    const notesText = data.notes?.trim() || null;
    const remarksSeed: string | null = null;

    // Serialize capacity check + create (advisory lock prevents double-book races)
    const booking = await prisma.$transaction(async (tx) => {
      let slotStart: Date | undefined;
      let slotEnd: Date | undefined;
      let tokenNumber: number | undefined;
      let sessionDate: Date | undefined;

      if (mode === ScheduleMode.TIME_BASED) {
        const startIso = data.slotStart!;
        slotStart = new Date(startIso);
        if (!isSlotStartBookable(slotStart)) {
          throw new AppError(400, "That time slot has already passed. Pick a later time.");
        }
        await lockProviderTimeSlot(tx, data.providerId, slotStart);
      }

      const [overrides, existingBookings] = await Promise.all([
        tx.scheduleOverride.findMany({
          where: {
            practiceId: data.practiceId,
            providerId: data.providerId,
            date: dayStart,
          },
        }),
        tx.practiceBooking.findMany({
          where: {
            practiceId: data.practiceId,
            providerId: data.providerId,
            status: { notIn: [BookingStatus.CANCELED, BookingStatus.NO_SHOW] },
            OR: [
              { slotStart: { gte: dayStart, lte: dayEnd } },
              { sessionDate: dayStart },
            ],
          },
        }),
      ]);

      if (mode === ScheduleMode.TIME_BASED) {
        if (
          !schedule &&
          !hasExtraSlotsForDay(overrides, date)
        ) {
          throw new AppError(404, "no schedule configured for this day.");
        }

        const slots = timeSlotsForProviderDay(
          allSchedules,
          date,
          existingBookings,
          overrides,
        );
        const match = slots.find((s) => sameLocalSlot(s.start, slotStart!));
        assertTimeSlotExclusive(existingBookings, slotStart!, match?.capacity);
        // Patients book one slot. Desk multi-slot (procedures) is PROVIDER_APP only.
        const deskDuration =
          channel === BookingChannel.PROVIDER_APP
            ? data.durationMinutes
            : undefined;
        let span = spanBookedWindow(slots, slotStart!, deskDuration);
        const covered = slots.filter(
          (s) =>
            s.start.getTime() >= span.start.getTime() &&
            s.start.getTime() < span.end.getTime() - 500,
        );
        if (covered.length > 1) {
          for (const s of covered) {
            await lockProviderTimeSlot(tx, data.providerId, s.start);
          }
          const again = await tx.practiceBooking.findMany({
            where: {
              practiceId: data.practiceId,
              providerId: data.providerId,
              status: { notIn: [BookingStatus.CANCELED, BookingStatus.NO_SHOW] },
              OR: [
                { slotStart: { gte: dayStart, lte: dayEnd } },
                { sessionDate: dayStart },
              ],
            },
          });
          span = spanBookedWindow(
            timeSlotsForProviderDay(allSchedules, date, again, overrides),
            span.start,
            deskDuration,
          );
        }
        // Always persist the engine's clinic-wall-clock instant (not a skewed client parse).
        slotStart = span.start;
        slotEnd = span.end;
      } else {
        if (!schedule) {
          throw new AppError(404, "no schedule configured for this day.");
        }
        sessionDate = dayStart;
        const next = assignNextToken(schedule, sessionDate, existingBookings, overrides);
        if (next === null) {
          throw new AppError(409, "token session is full or unavailable.");
        }
        tokenNumber = next;
      }

      const documents = normalizeBookingDocuments(data.documents);

      return tx.practiceBooking.create({
        data: {
          practiceId: data.practiceId,
          locationId: data.locationId,
          providerId: data.providerId,
          patientPhone: data.patientPhone,
          patientName: data.patientName,
          patientId: data.patientId,
          mode,
          status: BookingStatus.ACCEPTED,
          channel,
          slotStart,
          slotEnd,
          tokenNumber,
          sessionDate,
          consultationType: data.consultationType,
          disease: diseaseText || null,
          notes: notesText,
          doctorRemarks: remarksSeed,
          ...(documents.length ? { documents } : {}),
        },
        include: { practice: true, location: true },
      });
    });

    if (data.patientId && data.patientPhone) {
      void Promise.all([
        prisma.patient
          .update({
            where: { id: data.patientId },
            data: { contactNumber: data.patientPhone },
          })
          .catch(() => undefined),
        prisma.user
          .update({
            where: { id: data.patientId },
            data: {
              phone: data.patientPhone,
              ...(data.patientName ? { name: data.patientName } : {}),
            },
          })
          .catch(() => undefined),
      ]);
    }

    void NotificationService.enqueueConfirmation(booking.id, {
      skipPatientTemplate: Boolean(data.skipPatientNotification),
    }).catch((err) => {
      console.warn("notification enqueue failed (non-fatal):", err);
    });
    void broadcastProctoEvent(
      booking.practiceId,
      {
        event: "booking_created",
        booking: serializeBooking(booking),
      },
      booking.patientId,
    ).catch((err) => {
      console.warn("procto broadcast failed (non-fatal):", err);
    });
    void import("../opsSocket.js")
      .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
      .catch(() => undefined);

    console.log(
      `[createBooking] stored id=${booking.id} practice=${booking.practiceId} ` +
        `provider=${booking.providerId} phone=${booking.patientPhone} channel=${booking.channel}`,
    );
    return booking;
  },

  /**
   * Clinic-side emergency walk-in: patient is at the desk now. No slot / token
   * pick, no schedule or capacity check (must never be refused for lack of a
   * free slot). Starts "now", goes straight to WAITING, tagged
   * `consultationType = EMERGENCY_WALK_IN`. Patient WhatsApp confirmation uses
   * the full MSISDN (country code included).
   * Always tied to a registered patient (MRN): pick one from the desk search or register first.
   */
  async createWalkIn(
    data: {
      practiceId: string;
      providerId: string;
      locationId?: string;
      patientId?: string;
      /** Mobile of the picked patient — must match their record. */
      patientPhone: string;
      disease?: string;
    },
    actorUserId: string,
  ) {
    const complaint = data.disease?.trim().slice(0, 500) || "";
    if (!complaint) {
      throw new AppError(400, "Chief complaint is required.");
    }

    const { patientId, patientPhone, patientName, mrn } = await loadDeskPatient(
      data.practiceId,
      data.patientId,
      data.patientPhone,
      "walk-in",
    );
    await assertDeskActor(data.practiceId, data.providerId, actorUserId, "add walk-ins");

    const { assertBookingQuota } = await import("./planEntitlements.js");
    await assertBookingQuota(data.practiceId);

    const [practice, provider, location] = await Promise.all([
      prisma.practice.findUnique({
        where: { id: data.practiceId },
        select: { isActive: true },
      }),
      prisma.practiceMember.findFirst({
        where: {
          practiceId: data.practiceId,
          userId: data.providerId,
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.clinicLocation.findFirst({
        where: {
          practiceId: data.practiceId,
          isActive: true,
          ...(data.locationId ? { id: data.locationId } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
    ]);
    if (!practice?.isActive) throw new AppError(403, "This clinic is not active.");
    if (!provider) throw new AppError(400, "provider is not an active member of this practice.");
    if (!location) throw new AppError(400, "No active location configured for this clinic.");

    const now = new Date();
    const booking = await prisma.practiceBooking.create({
      data: {
        practiceId: data.practiceId,
        locationId: location.id,
        providerId: data.providerId,
        patientId,
        patientPhone,
        patientName,
        mode: ScheduleMode.TIME_BASED,
        status: BookingStatus.WAITING,
        arrivedAt: now,
        channel: BookingChannel.PROVIDER_APP,
        slotStart: now,
        slotEnd: new Date(now.getTime() + 15 * 60 * 1000),
        consultationType: EMERGENCY_WALK_IN,
        disease: complaint,
      },
      include: { practice: true, location: true },
    });

    // Walk-ins still need patient WhatsApp (check-in / booking confirm).
    // Skipping left doctor-portal adds with no patient message.
    void NotificationService.enqueueConfirmation(booking.id).catch(() => undefined);
    void broadcastProctoEvent(
      booking.practiceId,
      { event: "booking_created", booking: serializeBooking(booking) },
      booking.patientId,
    ).catch(() => undefined);
    void import("../opsSocket.js")
      .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
      .catch(() => undefined);

    console.log(
      `[createWalkIn] id=${booking.id} practice=${booking.practiceId} provider=${booking.providerId} patient=${patientId} by=${actorUserId}`,
    );
    void (async () => {
      const [{ recordAudit }, doctor] = await Promise.all([
        import("./practiceAudit.js"),
        prisma.user.findUnique({ where: { id: data.providerId }, select: { name: true } }),
      ]);
      const dr = doctor?.name?.trim() || "the doctor";
      await recordAudit({
        practiceId: booking.practiceId,
        actorUserId,
        action: "WALK_IN_ADDED",
        headline: "Emergency walk-in added",
        detail: `${patientName} (MRN ${mrn ?? "—"}) to ${/^dr\b/i.test(dr) ? dr : `Dr ${dr}`}'s waiting list${booking.disease ? ` · ${booking.disease}` : ""}`,
        entityType: "booking",
        entityId: booking.id,
        providerId: booking.providerId,
        meta: { patientId, mrn },
      });
    })().catch(() => undefined);
    return booking;
  },

  /**
   * Clinic-side appointment from the portal / desk: same slot engine as every channel, but the
   * patient must be a registered record (MRN) picked from the desk search, never a typed name.
   */
  async createDeskBooking(data: CreateBookingInput, actorUserId: string) {
    const patient = await loadDeskPatient(
      data.practiceId,
      data.patientId,
      data.patientPhone,
      "booking",
    );
    await assertDeskActor(data.practiceId, data.providerId, actorUserId, "book appointments");
    return BookingService.createBooking({
      ...data,
      patientId: patient.patientId,
      patientPhone: patient.patientPhone,
      patientName: patient.patientName,
      channel: BookingChannel.PROVIDER_APP,
    });
  },

  async updateStatus(
    bookingId: string,
    status: BookingStatus,
    actorUserId?: string,
    opts?: { skipPatientNotification?: boolean; cancelReason?: string },
  ) {
    const normalized = parseBookingStatus(status);
    const booking = await prisma.practiceBooking.findUnique({ where: { id: bookingId } });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    const existing = booking!;

    if (actorUserId) {
      const member = await prisma.practiceMember.findUnique({
        where: { practiceId_userId: { practiceId: existing.practiceId, userId: actorUserId } },
      });
      if (!member?.isActive) ResponseHandler.noPermission("not authorized.");
      const role = member!.role;
      const isAdmin =
        role === "PRACTICE_OWNER" || role === "PRACTICE_ADMIN";
      if (
        !isAdmin &&
        existing.providerId &&
        existing.providerId !== actorUserId
      ) {
        throw new AppError(
          403,
          "You can only update status for your own appointments. Clinic owners can manage the full roster.",
        );
      }
    }

    const terminal: BookingStatus[] = [
      BookingStatus.COMPLETED,
      BookingStatus.CANCELED,
      BookingStatus.NO_SHOW,
    ];
    if (terminal.includes(existing.status)) {
      throw new AppError(
        400,
        existing.status === BookingStatus.COMPLETED
          ? "completed appointments cannot be canceled or changed."
          : "this appointment is closed and cannot be changed.",
      );
    }

    if (existing.status === normalized) {
      return existing;
    }

    assertVisitStatusMove(existing.status, normalized, "status");
    if (
      normalized === BookingStatus.WAITING ||
      normalized === BookingStatus.IN_PROGRESS ||
      normalized === BookingStatus.COMPLETED
    ) {
      this.assertDocumentableToday(existing);
    }

    const closeReason =
      (normalized === BookingStatus.CANCELED || normalized === BookingStatus.NO_SHOW) &&
      opts?.cancelReason
        ? opts.cancelReason.slice(0, 250)
        : undefined;

    const updated = await prisma.practiceBooking.update({
      where: { id: bookingId },
      data: {
        status: normalized,
        ...arrivalPatch(existing.arrivedAt, normalized),
        ...(closeReason ? { cancelReason: closeReason } : {}),
      },
    });

    if (normalized === BookingStatus.CANCELED) {
      void NotificationService.enqueueCancellation(bookingId, {
        skipPatientTemplate: Boolean(opts?.skipPatientNotification),
      }).catch(() => undefined);
    }
    if (normalized === BookingStatus.ACCEPTED) {
      void NotificationService.enqueueConfirmation(bookingId, {
        skipPatientTemplate: Boolean(opts?.skipPatientNotification),
      }).catch(() => undefined);
    }
    if (normalized === BookingStatus.IN_PROGRESS) {
      void NotificationService.enqueueQueueAlert(bookingId).catch(() => undefined);
    }
    if (normalized === BookingStatus.WAITING) {
      void NotificationService.enqueueClinicStatusChange(
        bookingId,
        "WAITING",
      ).catch(() => undefined);
    }
    if (normalized === BookingStatus.NO_SHOW) {
      void NotificationService.enqueueClinicStatusChange(
        bookingId,
        "NO_SHOW",
      ).catch(() => undefined);
    }
    if (normalized === BookingStatus.COMPLETED) {
      void NotificationService.enqueueClinicStatusChange(
        bookingId,
        "COMPLETED",
      ).catch(() => undefined);
    }

    void broadcastProctoEvent(
      existing.practiceId,
      {
        event: "booking_updated",
        booking: serializeBooking(updated),
      },
      updated.patientId ?? existing.patientId,
    ).catch(() => undefined);
    void import("../opsSocket.js")
      .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
      .catch(() => undefined);

    return updated;
  },

  async reschedule(
    bookingId: string,
    data: {
      slotStart?: string;
      sessionDate?: string;
      phone?: string;
      patientId?: string;
      skipPatientNotification?: boolean;
    },
    /**
     * Schedule-change resolution only: validate against the version that will
     * apply on the target day (may be a pending one) and allow the visit to
     * take that version's booking type.
     */
    internal?: {
      schedulesOn?: (dayIso: string) => Promise<ProviderSchedule[]>;
      mode?: ScheduleMode;
    },
  ) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    const existing = booking!;
    const mode = internal?.mode ?? existing.mode;

    if (
      data.phone &&
      existing.patientPhone.replace(/\D/g, "").slice(-10) !==
        data.phone.replace(/\D/g, "").slice(-10)
    ) {
      if (!data.patientId || data.patientId !== existing.patientId) {
        throw new AppError(403, "not authorized to reschedule this booking.");
      }
    }

    if (existing.status === BookingStatus.COMPLETED) {
      throw new AppError(
        400,
        "completed appointments cannot be rescheduled.",
      );
    }

    if (
      ![
        BookingStatus.SCHEDULED,
        BookingStatus.REQUESTED,
        BookingStatus.ACCEPTED,
      ].includes(
        existing.status as "SCHEDULED" | "REQUESTED" | "ACCEPTED",
      )
    ) {
      throw new AppError(400, "only scheduled or accepted bookings can be rescheduled.");
    }
    if (!isBookingStillUpcoming(existing)) {
      throw new AppError(
        400,
        "This appointment time has already passed, so it can no longer be rescheduled.",
      );
    }

    const oldWhen =
      existing.mode === ScheduleMode.TOKEN_BASED
        ? `Token #${existing.tokenNumber ?? "?"} on ${
            existing.sessionDate
              ? formatLocalDate(existing.sessionDate)
              : "?"
          }`
        : existing.slotStart
          ? formatPracticeDateTime(existing.slotStart)
          : "";

    let date: Date;
    if (mode === ScheduleMode.TOKEN_BASED) {
      if (!data.sessionDate) {
        throw new AppError(400, "sessionDate is required for token reschedule.");
      }
      date = parseLocalDate(data.sessionDate);
    } else if (data.slotStart) {
      date = startOfLocalDay(new Date(data.slotStart));
    } else {
      throw new AppError(400, "slotStart is required for time-based reschedule.");
    }

    if (Number.isNaN(date.getTime())) {
      throw new AppError(400, "invalid booking date.");
    }

    const dayOfWeek = practiceWeekday(date);
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);

    const allSchedules = internal?.schedulesOn
      ? await internal.schedulesOn(formatLocalDate(date))
      : await loadSchedulesOn(
          {
            practiceId: existing.practiceId,
            providerId: existing.providerId,
            locationId: existing.locationId,
          },
          formatLocalDate(date),
        );
    const schedule = allSchedules.find(
      (s) => s.dayOfWeek === dayOfWeek && s.mode === mode,
    );
    if (!schedule && mode === ScheduleMode.TOKEN_BASED) {
      throw new AppError(404, "no schedule configured for this day.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      let slotStart: Date | null = null;
      let slotEnd: Date | null = null;
      let tokenNumber: number | null = null;
      let sessionDate: Date | null = null;

      if (mode === ScheduleMode.TIME_BASED) {
        slotStart = new Date(data.slotStart!);
        if (!isSlotStartBookable(slotStart)) {
          throw new AppError(400, "That time slot has already passed. Pick a later time.");
        }
        await lockProviderTimeSlot(tx, existing.providerId, slotStart);
      }

      const [overrides, existingBookings] = await Promise.all([
        tx.scheduleOverride.findMany({
          where: {
            practiceId: existing.practiceId,
            providerId: existing.providerId,
            date: dayStart,
          },
        }),
        tx.practiceBooking.findMany({
          where: {
            practiceId: existing.practiceId,
            providerId: existing.providerId,
            status: { notIn: [BookingStatus.CANCELED, BookingStatus.NO_SHOW] },
            id: { not: bookingId },
            OR: [
              { slotStart: { gte: dayStart, lte: dayEnd } },
              { sessionDate: dayStart },
            ],
          },
        }),
      ]);

      if (mode === ScheduleMode.TIME_BASED) {
        if (
          !schedule &&
          !hasExtraSlotsForDay(overrides, date)
        ) {
          throw new AppError(404, "no schedule configured for this day.");
        }

        const slots = timeSlotsForProviderDay(
          allSchedules,
          date,
          existingBookings,
          overrides,
        );
        const match = slots.find((s) => sameLocalSlot(s.start, slotStart!));
        assertTimeSlotExclusive(existingBookings, slotStart!, match?.capacity);
        if (!match?.available) {
          throw new AppError(409, "selected slot is not available.");
        }
        slotStart = match.start;
        slotEnd = match.end;
      } else {
        if (!schedule) {
          throw new AppError(404, "no schedule configured for this day.");
        }
        sessionDate = dayStart;
        const next = assignNextToken(schedule, sessionDate, existingBookings, overrides);
        if (next === null) {
          throw new AppError(409, "token session is full or unavailable.");
        }
        tokenNumber = next;
      }

      return tx.practiceBooking.update({
        where: { id: bookingId },
        data: {
          mode,
          slotStart,
          slotEnd,
          tokenNumber,
          sessionDate,
          status: BookingStatus.ACCEPTED,
          overrideSlot: false,
          overrideNote: null,
        },
        include: { practice: true, location: true },
      });
    });

    void NotificationService.enqueueReschedule(bookingId, oldWhen, {
      skipPatientTemplate: Boolean(data.skipPatientNotification),
    }).catch((err) => {
      console.warn("reschedule notification failed (non-fatal):", err);
    });
    void broadcastProctoEvent(
      existing.practiceId,
      {
        event: "booking_updated",
        booking: serializeBooking(updated),
      },
      updated.patientId ?? existing.patientId,
    ).catch(() => undefined);

    return updated;
  },

  /**
   * Move an upcoming visit to another doctor at the same clinic, same time
   * (time slot) or same day's token queue. The new doctor must be free then.
   */
  async reassignProvider(
    bookingId: string,
    toProviderId: string,
    opts?: { skipPatientNotification?: boolean },
  ) {
    const existing = await prisma.practiceBooking.findUnique({ where: { id: bookingId } });
    if (!existing) throw new AppError(404, "booking not found.");
    if (existing.providerId === toProviderId) {
      throw new AppError(400, "The appointment is already with this doctor.");
    }
    if (
      ![BookingStatus.SCHEDULED, BookingStatus.REQUESTED, BookingStatus.ACCEPTED].includes(
        existing.status as "SCHEDULED" | "REQUESTED" | "ACCEPTED",
      ) ||
      !isBookingStillUpcoming(existing)
    ) {
      throw new AppError(400, "Only upcoming scheduled or accepted appointments can be reassigned.");
    }
    const [member, fromDoctor, toDoctor] = await Promise.all([
      prisma.practiceMember.findUnique({
        where: { practiceId_userId: { practiceId: existing.practiceId, userId: toProviderId } },
      }),
      prisma.user.findUnique({ where: { id: existing.providerId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: toProviderId }, select: { name: true } }),
    ]);
    if (!member?.isActive || !toDoctor) {
      throw new AppError(400, "That doctor is not an active member of this clinic.");
    }

    const date =
      existing.mode === ScheduleMode.TIME_BASED
        ? startOfLocalDay(existing.slotStart!)
        : parseLocalDate(localDayOfSessionDate(existing.sessionDate!));
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);
    const schedules = await loadSchedulesOn(
      { practiceId: existing.practiceId, providerId: toProviderId, locationId: existing.locationId },
      formatLocalDate(date),
    );
    const doctorName = toDoctor.name || "the other doctor";

    const updated = await prisma.$transaction(async (tx) => {
      if (existing.mode === ScheduleMode.TIME_BASED) {
        await lockProviderTimeSlot(tx, toProviderId, existing.slotStart!);
      }
      const [overrides, dayBookings] = await Promise.all([
        tx.scheduleOverride.findMany({
          where: { practiceId: existing.practiceId, providerId: toProviderId, date: dayStart },
        }),
        tx.practiceBooking.findMany({
          where: {
            practiceId: existing.practiceId,
            providerId: toProviderId,
            status: { notIn: [BookingStatus.CANCELED, BookingStatus.NO_SHOW] },
            OR: [{ slotStart: { gte: dayStart, lte: dayEnd } }, { sessionDate: dayStart }],
          },
        }),
      ]);

      let tokenNumber = existing.tokenNumber;
      if (existing.mode === ScheduleMode.TIME_BASED) {
        const slot = timeSlotsForProviderDay(schedules, date, dayBookings, overrides).find((s) =>
          sameLocalSlot(s.start, existing.slotStart!),
        );
        if (!slot?.available) {
          throw new AppError(409, `${doctorName} isn't free at ${formatPracticeTime(existing.slotStart!)}.`);
        }
      } else {
        const schedule = schedules.find(
          (s) => s.dayOfWeek === practiceWeekday(date) && s.mode === ScheduleMode.TOKEN_BASED,
        );
        const next = schedule ? assignNextToken(schedule, dayStart, dayBookings, overrides) : null;
        if (next === null) {
          throw new AppError(409, `${doctorName} has no open token queue that day.`);
        }
        tokenNumber = next;
      }

      await tx.paymentRequest.updateMany({
        where: { bookingId },
        data: { providerId: toProviderId },
      });
      return tx.practiceBooking.update({
        where: { id: bookingId },
        data: { providerId: toProviderId, tokenNumber, overrideSlot: false, overrideNote: null },
      });
    });

    const oldWhen =
      (existing.mode === ScheduleMode.TOKEN_BASED
        ? `Token #${existing.tokenNumber ?? "?"} on ${formatLocalDate(date)}`
        : formatPracticeDateTime(existing.slotStart!)) +
      (fromDoctor?.name ? ` with ${fromDoctor.name}` : "");
    void NotificationService.enqueueReschedule(bookingId, oldWhen, {
      skipPatientTemplate: Boolean(opts?.skipPatientNotification),
    }).catch((err) => console.warn("reassign notification failed (non-fatal):", err));
    void broadcastProctoEvent(
      existing.practiceId,
      { event: "booking_updated", booking: serializeBooking(updated) },
      updated.patientId,
    ).catch(() => undefined);
    return updated;
  },

  /**
   * Staff calendar move: same day or another day, same doctor or another,
   * keeping the visit's duration (one row, longer slotEnd when it spans slots).
   */
  async moveVisit(
    bookingId: string,
    actorUserId: string,
    input: {
      providerId?: string;
      slotStart?: string;
      durationMinutes?: number;
      notifyPatient?: boolean;
    },
  ) {
    if (!isUuid(bookingId)) throw new AppError(400, "Invalid appointment.");
    const existing = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
    });
    if (!existing) throw new AppError(404, "Appointment not found.");
    if (existing.mode !== ScheduleMode.TIME_BASED || !existing.slotStart) {
      throw new AppError(400, "Only timed appointments can be moved on the calendar.");
    }
    const fromSlotStart = existing.slotStart;
    if (
      ![BookingStatus.SCHEDULED, BookingStatus.REQUESTED, BookingStatus.ACCEPTED].includes(
        existing.status as "SCHEDULED" | "REQUESTED" | "ACCEPTED",
      ) ||
      !isBookingStillUpcoming(existing)
    ) {
      throw new AppError(400, "Only upcoming appointments can be moved.");
    }

    const toProviderId = String(input.providerId || existing.providerId).trim();
    if (!isUuid(toProviderId)) throw new AppError(400, "Pick a doctor.");
    const requested = new Date(String(input.slotStart || ""));
    if (Number.isNaN(requested.getTime())) throw new AppError(400, "Pick a time.");
    if (!isSlotStartBookable(requested)) {
      throw new AppError(400, "That time slot has already passed. Pick a later time.");
    }

    await assertDeskActor(existing.practiceId, existing.providerId, actorUserId, "move appointments");
    await assertDeskActor(existing.practiceId, toProviderId, actorUserId, "move appointments");

    const target = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId: existing.practiceId, userId: toProviderId } },
    });
    if (!target?.isActive) {
      throw new AppError(400, "That doctor is not an active member of this clinic.");
    }

    const existingDur =
      existing.slotEnd != null
        ? Math.round((existing.slotEnd.getTime() - existing.slotStart.getTime()) / 60_000)
        : undefined;
    const durationMinutes =
      input.durationMinutes != null && Number.isFinite(Number(input.durationMinutes))
        ? Number(input.durationMinutes)
        : existingDur;

    const date = startOfLocalDay(requested);
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);
    const schedules = await loadSchedulesOn(
      {
        practiceId: existing.practiceId,
        providerId: toProviderId,
        locationId: existing.locationId,
      },
      formatLocalDate(date),
    );
    const [fromDoctor, toDoctor] = await Promise.all([
      prisma.user.findUnique({ where: { id: existing.providerId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: toProviderId }, select: { name: true } }),
    ]);

    const updated = await prisma.$transaction(async (tx) => {
      await lockProviderTimeSlot(tx, toProviderId, requested);
      const loadDay = () =>
        Promise.all([
          tx.scheduleOverride.findMany({
            where: { practiceId: existing.practiceId, providerId: toProviderId, date: dayStart },
          }),
          tx.practiceBooking.findMany({
            where: {
              practiceId: existing.practiceId,
              providerId: toProviderId,
              id: { not: bookingId },
              status: { notIn: [BookingStatus.CANCELED, BookingStatus.NO_SHOW] },
              OR: [{ slotStart: { gte: dayStart, lte: dayEnd } }, { sessionDate: dayStart }],
            },
          }),
        ]);

      let [overrides, dayBookings] = await loadDay();
      let slots = timeSlotsForProviderDay(schedules, date, dayBookings, overrides);
      let span = spanBookedWindow(slots, requested, durationMinutes);
      const covered = slots.filter(
        (s) =>
          s.start.getTime() >= span.start.getTime() &&
          s.start.getTime() < span.end.getTime() - 500,
      );
      if (covered.length > 1) {
        for (const s of covered) await lockProviderTimeSlot(tx, toProviderId, s.start);
        ;[overrides, dayBookings] = await loadDay();
        slots = timeSlotsForProviderDay(schedules, date, dayBookings, overrides);
        span = spanBookedWindow(slots, span.start, durationMinutes);
      }

      if (existing.providerId !== toProviderId) {
        await tx.paymentRequest.updateMany({
          where: { bookingId },
          data: { providerId: toProviderId },
        });
      }
      return tx.practiceBooking.update({
        where: { id: bookingId },
        data: {
          providerId: toProviderId,
          slotStart: span.start,
          slotEnd: span.end,
          overrideSlot: false,
          overrideNote: null,
        },
      });
    });

    const oldWhen =
      formatPracticeDateTime(existing.slotStart) +
      (fromDoctor?.name ? ` with ${fromDoctor.name}` : "");
    if (input.notifyPatient !== false) {
      void NotificationService.enqueueReschedule(bookingId, oldWhen).catch((err) =>
        console.warn("move notification failed (non-fatal):", err),
      );
    }
    void broadcastProctoEvent(
      existing.practiceId,
      { event: "booking_updated", booking: serializeBooking(updated) },
      updated.patientId,
    ).catch(() => undefined);
    void (async () => {
      const { recordAudit } = await import("./practiceAudit.js");
      const who = toDoctor?.name?.trim() || "the doctor";
      await recordAudit({
        practiceId: existing.practiceId,
        actorUserId,
        action: "BOOKING_MOVED",
        headline: "Appointment moved",
        detail: `${existing.patientName || "Patient"} to ${formatPracticeDateTime(updated.slotStart!)} with ${who}`,
        entityType: "booking",
        entityId: bookingId,
        providerId: toProviderId,
        meta: {
          fromProviderId: existing.providerId,
          fromSlotStart: fromSlotStart.toISOString(),
          notifyPatient: input.notifyPatient !== false,
        },
      });
    })().catch(() => undefined);
    return updated;
  },

  /** Keep a visit valid outside the doctor's (new) schedule — an "Override slot". */
  async keepAsOverride(bookingId: string, note?: string | null) {
    const updated = await prisma.practiceBooking.update({
      where: { id: bookingId },
      data: { overrideSlot: true, overrideNote: note?.trim().slice(0, 250) || null },
    });
    void broadcastProctoEvent(
      updated.practiceId,
      { event: "booking_updated", booking: serializeBooking(updated) },
      updated.patientId,
    ).catch(() => undefined);
    return updated;
  },

  /** Clinic calendar day of the visit. Same-day later times are still today. */
  appointmentDayIso(booking: {
    slotStart: Date | null;
    sessionDate: Date | null;
  }): string | null {
    if (booking.slotStart) return formatLocalDate(booking.slotStart);
    if (booking.sessionDate) return localDayOfSessionDate(booking.sessionDate);
    return null;
  },

  assertDocumentableToday(booking: {
    slotStart: Date | null;
    sessionDate: Date | null;
  }) {
    const day = this.appointmentDayIso(booking);
    if (isClinicDayAfterToday(day)) {
      throw new AppError(
        400,
        "You can document this visit on its appointment day, not on a later day.",
      );
    }
  },

  async updateVisit(
    bookingId: string,
    data: {
      doctorRemarks?: string | null;
      medicines?: Array<{
        name: string;
        amount?: string;
        dose?: string;
        doseUnit?: string;
        times?: string[];
        frequency?: string;
        strength?: string;
        route?: string;
        duration?: string;
        durationUnit?: string;
        startDate?: string;
        endDate?: string;
        instruction?: string;
      }>;
      documents?: Array<{ name: string; url: string; uploadedAt?: string }>;
      clinicalAssessment?: unknown;
      status?: BookingStatus;
      /** Patient's chief complaint. Omitted leaves the saved text unchanged. */
      disease?: string | null;
    },
    actorUserId: string,
  ) {
    const booking = await prisma.practiceBooking.findUnique({ where: { id: bookingId } });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    const existing = booking!;

    const member = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId: existing.practiceId, userId: actorUserId } },
    });
    if (!member?.isActive) ResponseHandler.noPermission("not authorized.");
    const role = member!.role;
    const isAdmin =
      role === "PRACTICE_OWNER" || role === "PRACTICE_ADMIN";
    if (
      !isAdmin &&
      existing.providerId &&
      existing.providerId !== actorUserId
    ) {
      throw new AppError(
        403,
        "You can only edit visits assigned to you. Clinic owners can manage the full roster.",
      );
    }

    if (data.disease !== undefined && !data.disease?.trim()) {
      throw new AppError(400, "Chief complaint is required.");
    }

    const diseaseOnly =
      data.disease !== undefined &&
      data.doctorRemarks === undefined &&
      data.medicines === undefined &&
      data.documents === undefined &&
      data.clinicalAssessment === undefined &&
      !data.status;
    if (!diseaseOnly) {
      this.assertDocumentableToday(existing);
    }
    if (
      !diseaseOnly &&
      (existing.status === BookingStatus.COMPLETED ||
        existing.status === BookingStatus.CANCELED ||
        existing.status === BookingStatus.NO_SHOW)
    ) {
      throw new AppError(
        400,
        existing.status === BookingStatus.COMPLETED
          ? "visit is already completed."
          : "this appointment is closed and cannot be edited.",
      );
    }

    const medicines =
      data.medicines !== undefined
        ? normalizeMedicines(data.medicines)
        : undefined;
    const documents =
      data.documents !== undefined
        ? normalizeBookingDocuments(data.documents)
        : undefined;
    const { normalizeClinicalAssessment, clinicalAssessmentBody } = await import(
      "../../lib/clinicalMasters.js"
    );
    const previousAssessment =
      data.clinicalAssessment !== undefined
        ? normalizeClinicalAssessment(existing.clinicalAssessment)
        : null;
    const clinicalChanged =
      data.clinicalAssessment !== undefined &&
      clinicalAssessmentBody(data.clinicalAssessment) !==
        clinicalAssessmentBody(existing.clinicalAssessment);
    const savedAtIso = new Date().toISOString();
    const clinicalAssessment =
      data.clinicalAssessment !== undefined
        ? data.clinicalAssessment == null
          ? null
          : {
              ...normalizeClinicalAssessment(data.clinicalAssessment),
              savedAt: clinicalChanged
                ? savedAtIso
                : previousAssessment?.savedAt ||
                  previousAssessment?.vitals?.recordedAt ||
                  null,
            }
        : undefined;
    const nextStatus = data.status ? parseBookingStatus(data.status) : undefined;
    if (nextStatus && nextStatus !== existing.status) {
      assertVisitStatusMove(existing.status, nextStatus, "visit");
    }

    const prevDocsKey = JSON.stringify(existing.documents ?? []);
    const nextDocsKey = JSON.stringify(documents ?? existing.documents ?? []);
    const documentsChanged =
      data.documents !== undefined && prevDocsKey !== nextDocsKey;
    const prevDocCount = Array.isArray(existing.documents)
      ? existing.documents.length
      : 0;
    const nextDocCount = Array.isArray(documents)
      ? documents.length
      : prevDocCount;
    const documentsAdded = documentsChanged && nextDocCount > prevDocCount;

    const updated = await prisma.practiceBooking.update({
      where: { id: bookingId },
      data: {
        ...(data.doctorRemarks !== undefined
          ? { doctorRemarks: data.doctorRemarks?.trim() || null }
          : {}),
        ...(data.disease !== undefined
          ? { disease: data.disease?.trim().slice(0, 500) || null }
          : {}),
        ...(medicines !== undefined ? { medicines } : {}),
        ...(documents !== undefined ? { documents } : {}),
        ...(clinicalAssessment !== undefined
          ? {
              clinicalAssessment:
                clinicalAssessment === null
                  ? Prisma.DbNull
                  : (clinicalAssessment as Prisma.InputJsonValue),
            }
          : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
        ...arrivalPatch(existing.arrivedAt, nextStatus),
      },
      include: {
        practice: {
          select: {
            name: true,
            slug: true,
            specialty: true,
            consultationFee: true,
            clinicalMasters: true,
          },
        },
        location: { select: { name: true, address: true, city: true } },
      },
    });

    if (clinicalChanged) {
      const actor = await prisma.user.findUnique({
        where: { id: actorUserId },
        select: { name: true },
      });
      await prisma.clinicalAssessmentVersion.create({
        data: {
          bookingId,
          actorUserId,
          actorName: actor?.name ?? null,
          snapshot: (clinicalAssessment ?? {
            savedAt: savedAtIso,
          }) as Prisma.InputJsonValue,
          savedAt: new Date(savedAtIso),
        },
      });
    }

    if (documentsAdded && Array.isArray(documents)) {
      const newest = documents[documents.length - 1] as
        | { name?: string }
        | undefined;
      const docName = String(newest?.name || "").trim() || "Document";
      void NotificationService.enqueueClinicDocumentAttached(
        bookingId,
        docName,
        { kind: "visit" },
      ).catch(() => undefined);
    }

    if (nextStatus === BookingStatus.IN_PROGRESS) {
      void NotificationService.enqueueQueueAlert(bookingId).catch(() => undefined);
    }
    if (nextStatus === BookingStatus.CANCELED) {
      void NotificationService.enqueueCancellation(bookingId).catch(() => undefined);
    }
    if (nextStatus === BookingStatus.WAITING) {
      void NotificationService.enqueueClinicStatusChange(
        bookingId,
        "WAITING",
      ).catch(() => undefined);
    }
    if (nextStatus === BookingStatus.NO_SHOW) {
      void NotificationService.enqueueClinicStatusChange(
        bookingId,
        "NO_SHOW",
      ).catch(() => undefined);
    }
    if (nextStatus === BookingStatus.COMPLETED) {
      void NotificationService.enqueueClinicStatusChange(
        bookingId,
        "COMPLETED",
      ).catch(() => undefined);
    }
    // Saving medicines or finishing the visit does not message the patient.
    // Send to customer delivers a prescription PDF on WhatsApp.

    void broadcastProctoEvent(
      existing.practiceId,
      {
        event: "booking_updated",
        booking: serializeBooking(updated),
      },
      updated.patientId ?? existing.patientId,
    ).catch(() => undefined);
    void import("../opsSocket.js")
      .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
      .catch(() => undefined);

    const clinicalVersions = await prisma.clinicalAssessmentVersion.findMany({
      where: { bookingId },
      orderBy: { savedAt: "desc" },
      take: 30,
      select: { id: true, savedAt: true, actorName: true, snapshot: true },
    });
    return {
      ...(await this.enrichBooking(updated)),
      clinicalVersions,
    };
  },

  /**
   * Patient-level General Documents for the visit page. Only resolves a patient
   * the booking is tied to (patientId, or a single account on that phone) —
   * never guesses on a shared number.
   */
  async resolveBookingPatientForDocs(bookingId: string, actorUserId: string) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        practiceId: true,
        providerId: true,
        patientId: true,
        patientPhone: true,
        status: true,
      },
    });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    const b = booking!;
    const { PracticeService } = await import("./practice.service.js");
    await PracticeService.assertCanViewBooking(b.practiceId, actorUserId, b.providerId);

    let patientId: string | null = null;
    if (b.patientId) {
      const p = await prisma.patient.findUnique({
        where: { id: b.patientId },
        select: { id: true },
      });
      patientId = p?.id ?? null;
    }
    if (!patientId) {
      const digits = String(b.patientPhone || "").replace(/\D/g, "").slice(-10);
      if (digits.length === 10) {
        const matches = await prisma.user.findMany({
          where: {
            role: "user",
            patient: { isNot: null },
            OR: [
              { phone: { endsWith: digits } },
              { patient: { is: { contactNumber: { endsWith: digits } } } },
            ],
          },
          select: { id: true },
          take: 2,
        });
        if (matches.length === 1) patientId = matches[0]!.id;
      }
    }
    return { booking: b, patientId };
  },

  async listGeneralDocuments(bookingId: string, actorUserId: string) {
    const { patientId } = await this.resolveBookingPatientForDocs(bookingId, actorUserId);
    if (!patientId) return { patientLinked: false, documents: [] };
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { documents: true },
    });
    return {
      patientLinked: true,
      documents: normalizeBookingDocuments(
        Array.isArray(patient?.documents)
          ? (patient!.documents as Array<{ name?: string; url?: string; uploadedAt?: string }>)
          : [],
      ),
    };
  },

  async addGeneralDocument(
    bookingId: string,
    doc: { name?: string; url?: string },
    actorUserId: string,
  ) {
    const { booking, patientId } = await this.resolveBookingPatientForDocs(
      bookingId,
      actorUserId,
    );
    const member = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId: booking.practiceId, userId: actorUserId } },
    });
    const isAdmin =
      member?.role === "PRACTICE_OWNER" || member?.role === "PRACTICE_ADMIN";
    if (!member?.isActive || (!isAdmin && booking.providerId !== actorUserId)) {
      throw new AppError(
        403,
        "You can only add documents to visits assigned to you.",
      );
    }
    if (!patientId) {
      throw new AppError(
        400,
        "This visit is not linked to a registered patient, so there is no patient record to save to.",
      );
    }
    const [item] = normalizeBookingDocuments([doc]);
    if (!item) throw new AppError(400, "document url is required.");
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { documents: true },
    });
    const existing = normalizeBookingDocuments(
      Array.isArray(patient?.documents)
        ? (patient!.documents as Array<{ name?: string; url?: string; uploadedAt?: string }>)
        : [],
    );
    if (existing.length >= MAX_GENERAL_DOCUMENTS) {
      throw new AppError(
        400,
        `At most ${MAX_GENERAL_DOCUMENTS} general documents per patient.`,
      );
    }
    const next = [...existing, item];
    await prisma.patient.update({
      where: { id: patientId },
      data: { documents: next as unknown as Prisma.InputJsonValue },
    });
    void import("../opsSocket.js")
      .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
      .catch(() => undefined);
    return { patientLinked: true, documents: next };
  },

  /**
   * Explicit Send to customer. Delivers a prescription PDF on WhatsApp.
   * Saving medicines or finishing the visit never calls this.
   */
  async sendClinicLogWhatsApp(bookingId: string, actorUserId: string) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        practiceId: true,
        providerId: true,
        status: true,
        patientPhone: true,
        patientId: true,
      },
    });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    const existing = booking!;

    const member = await prisma.practiceMember.findUnique({
      where: {
        practiceId_userId: {
          practiceId: existing.practiceId,
          userId: actorUserId,
        },
      },
    });
    if (!member?.isActive) ResponseHandler.noPermission("not authorized.");
    const role = member!.role;
    const frontDesk =
      role === "PRACTICE_OWNER" ||
      role === "PRACTICE_ADMIN" ||
      role === "RECEPTIONIST" ||
      role === "NURSE";
    if (!frontDesk && existing.providerId !== actorUserId) {
      throw new AppError(
        403,
        "You can only send clinic logs for visits assigned to you.",
      );
    }
    if (!explicitClinicLogTemplate(existing.status)) {
      throw new AppError(
        400,
        "This appointment is closed and cannot be sent.",
      );
    }
    if (!String(existing.patientPhone || "").trim()) {
      throw new AppError(400, "This visit has no patient phone number.");
    }

    const { sendClinicLogPdf } = await import("./clinicLogPdf.js");
    const sent = await sendClinicLogPdf(bookingId);
    return {
      filename: sent.filename,
      messageId: sent.messageId ?? null,
      simulated: Boolean(sent.simulated),
      delivery: "pdf",
    };
  },

  /**
   * Care chat "attach": save the file on the appointment, post it in the
   * clinic ↔ patient chat, and deliver it on the patient's WhatsApp.
   */
  async shareDocumentWithPatient(
    bookingId: string,
    input: { name?: string; url?: string; caption?: string },
    actorUserId: string,
  ) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      include: { practice: { select: { name: true } } },
    });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    const existing = booking!;

    const member = await prisma.practiceMember.findUnique({
      where: {
        practiceId_userId: { practiceId: existing.practiceId, userId: actorUserId },
      },
    });
    if (!member?.isActive) ResponseHandler.noPermission("not authorized.");
    const role = member!.role;
    const frontDesk =
      role === "PRACTICE_OWNER" ||
      role === "PRACTICE_ADMIN" ||
      role === "RECEPTIONIST" ||
      role === "NURSE";
    if (!frontDesk && existing.providerId !== actorUserId) {
      throw new AppError(
        403,
        "You can only share documents on visits assigned to you.",
      );
    }
    if (!existing.patientId) {
      throw new AppError(
        400,
        "This visit is not linked to a registered patient, so there is no chat to send to.",
      );
    }

    const { isClinicDocumentUrl, sendCareDocumentToWhatsApp } = await import(
      "../chat.whatsappFanout.js"
    );
    const url = String(input.url || "").trim();
    if (!isClinicDocumentUrl(url)) {
      throw new AppError(400, "Upload the file first, then share it.");
    }
    const name = String(input.name || "").trim().slice(0, 120) || "Document";
    const caption = String(input.caption || "").trim().slice(0, 900);

    const docs = normalizeBookingDocuments(
      Array.isArray(existing.documents)
        ? (existing.documents as Array<{ name?: string; url?: string; uploadedAt?: string }>)
        : [],
    );
    if (docs.length >= MAX_SHARED_VISIT_DOCUMENTS) {
      throw new AppError(
        400,
        `This visit already has ${MAX_SHARED_VISIT_DOCUMENTS} documents.`,
      );
    }
    const doc = { name, url, uploadedAt: new Date().toISOString() };
    const updated = await prisma.practiceBooking.update({
      where: { id: bookingId },
      data: { documents: [...docs, doc] as unknown as Prisma.InputJsonValue },
      include: {
        practice: {
          select: { name: true, slug: true, specialty: true, consultationFee: true },
        },
        location: { select: { name: true, address: true, city: true } },
      },
    });

    void broadcastProctoEvent(
      existing.practiceId,
      { event: "booking_updated", booking: serializeBooking(updated) },
      updated.patientId,
    ).catch(() => undefined);
    void import("../opsSocket.js")
      .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
      .catch(() => undefined);

    const { ChatService } = await import("../chat.js");
    const message = await ChatService.sendDirectMessage(
      actorUserId,
      existing.patientId,
      `📎 ${name}\n${url}${caption ? `\n${caption}` : ""}`,
      { whatsappFanOut: false },
    );

    const [sender, patient] = await Promise.all([
      prisma.user.findUnique({ where: { id: actorUserId }, select: { name: true } }),
      prisma.user.findUnique({
        where: { id: existing.patientId },
        select: { phone: true, patient: { select: { contactNumber: true } } },
      }),
    ]);
    const whatsapp = await sendCareDocumentToWhatsApp({
      practiceId: existing.practiceId,
      practiceName: existing.practice?.name || "your clinic",
      providerName: sender?.name || "Your clinic",
      patientUserId: existing.patientId,
      staffUserId: actorUserId,
      phones: [existing.patientPhone, patient?.patient?.contactNumber, patient?.phone],
      doc: { name, url },
      caption,
    });

    return {
      booking: await this.enrichBooking(updated),
      document: doc,
      message,
      whatsapp,
    };
  },

  /**
   * Patient app/portal: attach a file to their own visit, post it in care chat
   * for the doctor, and alert the clinic inbox.
   */
  async attachPatientDocument(
    bookingId: string,
    input: { name?: string; url?: string; caption?: string },
    actorUserId: string,
  ) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      include: { practice: { select: { name: true } } },
    });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    const existing = booking!;

    if (!existing.patientId || existing.patientId !== actorUserId) {
      throw new AppError(
        403,
        "You can only attach documents to your own appointments.",
      );
    }
    if (
      existing.status === BookingStatus.CANCELED ||
      existing.status === BookingStatus.NO_SHOW
    ) {
      throw new AppError(
        400,
        "This visit is closed, so documents cannot be attached.",
      );
    }
    if (!existing.providerId) {
      throw new AppError(
        400,
        "This visit has no doctor assigned yet, so there is no chat to send to.",
      );
    }

    const { isClinicDocumentUrl } = await import("../chat.whatsappFanout.js");
    const url = String(input.url || "").trim();
    if (!isClinicDocumentUrl(url)) {
      throw new AppError(400, "Upload the file first, then attach it.");
    }
    const name = String(input.name || "").trim().slice(0, 120) || "Document";
    const caption = String(input.caption || "").trim().slice(0, 900);

    const docs = normalizeBookingDocuments(
      Array.isArray(existing.documents)
        ? (existing.documents as Array<{
            name?: string;
            url?: string;
            uploadedAt?: string;
          }>)
        : [],
    );
    if (docs.length >= MAX_SHARED_VISIT_DOCUMENTS) {
      throw new AppError(
        400,
        `This visit already has ${MAX_SHARED_VISIT_DOCUMENTS} documents.`,
      );
    }
    const doc = { name, url, uploadedAt: new Date().toISOString() };
    const updated = await prisma.practiceBooking.update({
      where: { id: bookingId },
      data: { documents: [...docs, doc] as unknown as Prisma.InputJsonValue },
      include: {
        practice: {
          select: {
            name: true,
            slug: true,
            specialty: true,
            consultationFee: true,
          },
        },
        location: { select: { name: true, address: true, city: true } },
      },
    });

    void broadcastProctoEvent(
      existing.practiceId,
      { event: "booking_updated", booking: serializeBooking(updated) },
      updated.patientId,
    ).catch(() => undefined);
    void import("../opsSocket.js")
      .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
      .catch(() => undefined);

    const { ChatService } = await import("../chat.js");
    const message = await ChatService.sendDirectMessage(
      actorUserId,
      existing.providerId,
      `📎 ${name}\n${url}${caption ? `\n${caption}` : ""}`,
      { whatsappFanOut: false },
    );

    void NotificationService.enqueueClinicDocumentAttached(bookingId, name, {
      kind: "visit",
    }).catch(() => undefined);

    return {
      booking: await this.enrichBooking(updated),
      document: doc,
      message,
    };
  },

  async getById(bookingId: string) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      include: {
        practice: {
          select: {
            id: true,
            name: true,
            slug: true,
            specialty: true,
            consultationFee: true,
            clinicalMasters: true,
            stampSrc: true,
            phone: true,
            email: true,
          },
        },
        location: { select: { name: true, address: true, city: true } },
      },
    });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    const row = booking!;
    await this.ensureClinicalVersion(row);
    const clinicalVersions = await prisma.clinicalAssessmentVersion.findMany({
      where: { bookingId },
      orderBy: { savedAt: "desc" },
      take: 30,
      select: { id: true, savedAt: true, actorName: true, snapshot: true },
    });
    return {
      ...(await this.enrichBooking(row)),
      clinicalVersions,
    };
  },

  /** First open of a visit that already has vitals/pain/allergies gets one log row. */
  async ensureClinicalVersion(booking: {
    id: string;
    clinicalAssessment: unknown;
    updatedAt: Date;
  }) {
    const existing = await prisma.clinicalAssessmentVersion.count({
      where: { bookingId: booking.id },
    });
    if (existing > 0) return;
    const { normalizeClinicalAssessment, clinicalAssessmentHasContent } =
      await import("../../lib/clinicalMasters.js");
    if (!clinicalAssessmentHasContent(booking.clinicalAssessment)) return;
    const normalized = normalizeClinicalAssessment(booking.clinicalAssessment);
    const stamp =
      normalized?.savedAt ||
      normalized?.vitals?.recordedAt ||
      booking.updatedAt.toISOString();
    const savedAt = new Date(stamp);
    await prisma.clinicalAssessmentVersion.create({
      data: {
        bookingId: booking.id,
        snapshot: {
          ...(normalized ?? {}),
          savedAt: Number.isNaN(savedAt.getTime())
            ? booking.updatedAt.toISOString()
            : savedAt.toISOString(),
        } as Prisma.InputJsonValue,
        savedAt: Number.isNaN(savedAt.getTime()) ? booking.updatedAt : savedAt,
      },
    });
  },

  async enrichBooking<
    T extends {
      providerId: string;
      patientId: string | null;
      patientPhone: string;
      patientName: string | null;
    },
  >(booking: T) {
    const [provider, linkedById, linkedByPhone] = await Promise.all([
      prisma.user.findUnique({
        where: { id: booking.providerId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          doctor: {
            select: {
              licenseNo: true,
              stampSrc: true,
              description: true,
              experience: true,
              contactNumbers: true,
            },
          },
        },
      }),
      booking.patientId
        ? prisma.user.findUnique({
            where: { id: booking.patientId },
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
                  emergencyNumber: true,
                  profession: true,
                  relationship: true,
                },
              },
            },
          })
        : Promise.resolve(null),
      prisma.user.findFirst({
        where: {
          role: "user",
          OR: [
            { phone: booking.patientPhone },
            { patient: { contactNumber: booking.patientPhone } },
          ],
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
              emergencyNumber: true,
              profession: true,
              relationship: true,
            },
          },
        },
      }),
    ]);

    const linked = linkedById ?? linkedByPhone;

    return {
      ...booking,
      provider: provider
        ? {
            id: provider.id,
            name: provider.name,
            email: provider.email,
            phone: provider.phone,
            licenseNo: provider.doctor?.licenseNo ?? null,
            stampSrc: provider.doctor?.stampSrc ?? null,
            description: provider.doctor?.description ?? null,
            experience: provider.doctor?.experience ?? null,
            contactNumbers: provider.doctor?.contactNumbers ?? [],
          }
        : null,
      patient: linked
        ? {
            id: linked.id,
            name: linked.name,
            email: publicPatientEmail(linked.email),
            phone: linked.phone ?? linked.patient?.contactNumber ?? null,
            gender: linked.gender,
            address: publicPatientAddress(linked.address),
            imgSrc: linked.imgSrc,
            dateOfBirth: linked.patient?.dateOfBirth ?? null,
            age: ageFromDob(linked.patient?.dateOfBirth),
            contactNumber: linked.patient?.contactNumber ?? null,
            emergencyNumber: linked.patient?.emergencyNumber ?? null,
            mrn: linked.patient?.mrn ?? null,
            profession: linked.patient?.profession ?? null,
            relationship: linked.patient?.relationship ?? null,
          }
        : {
            id: null,
            name: booking.patientName,
            email: null,
            phone: booking.patientPhone,
            gender: null,
            address: null,
            imgSrc: null,
            dateOfBirth: null,
            age: null,
            contactNumber: booking.patientPhone,
            emergencyNumber: null,
            mrn: null,
            profession: null,
            relationship: null,
          },
    };
  },

  async cancelByPatient(
    bookingId: string,
    opts: {
      phone?: string;
      patientId?: string;
      reason?: string;
      skipPatientNotification?: boolean;
    },
  ) {
    const booking = await this.getById(bookingId);
    const phoneOk =
      opts.phone &&
      opts.phone.replace(/\D/g, "").slice(-10) ===
        booking.patientPhone.replace(/\D/g, "").slice(-10);
    const patientOk = opts.patientId && booking.patientId === opts.patientId;
    if (!phoneOk && !patientOk) {
      ResponseHandler.noPermission("you cannot cancel this booking.");
    }
    if (
      ![
        BookingStatus.SCHEDULED,
        BookingStatus.REQUESTED,
        BookingStatus.ACCEPTED,
        BookingStatus.WAITING,
      ].includes(
        booking.status as
          | "SCHEDULED"
          | "REQUESTED"
          | "ACCEPTED"
          | "WAITING",
      )
    ) {
      throw new AppError(
        400,
        booking.status === BookingStatus.COMPLETED
          ? "completed appointments cannot be canceled."
          : "only requested or accepted appointments can be canceled.",
      );
    }
    // WAITING = checked in at the clinic; they may still cancel after the slot time.
    if (
      booking.status !== BookingStatus.WAITING &&
      !isBookingStillUpcoming(booking)
    ) {
      throw new AppError(
        400,
        "This appointment time has already passed, so it can no longer be canceled.",
      );
    }
    const reason = opts.reason?.trim().slice(0, 280);
    if (reason) {
      const prev = booking.notes?.trim() || "";
      await prisma.practiceBooking.update({
        where: { id: bookingId },
        data: {
          notes: prev
            ? `${prev}\n[Cancel reason] ${reason}`
            : `[Cancel reason] ${reason}`,
        },
      });
    }
    return this.updateStatus(bookingId, BookingStatus.CANCELED, undefined, {
      skipPatientNotification: Boolean(opts.skipPatientNotification),
    });
  },

  async listForPatient(opts: {
    phone?: string;
    patientId?: string;
    practiceId?: string;
    statuses?: BookingStatus[];
    /** Only visits that have not started (slot) / not a past token day. */
    upcomingOnly?: boolean;
    /** Newest slot first, so future visits are not dropped by the take limit. */
    order?: "asc" | "desc";
    updatedSince?: Date;
    take?: number;
  }) {
    const or: Record<string, unknown>[] = [];
    if (opts.patientId) {
      or.push({ patientId: opts.patientId });
      // Unlinked visits on this exact number stay with the signed-in person.
      // Another patient's record on a lookalike number does not.
      if (opts.phone) {
        const digits = opts.phone.replace(/\D/g, "").slice(-10);
        or.push({ patientId: null, patientPhone: opts.phone });
        if (digits.length >= 10) {
          or.push({ patientId: null, patientPhone: { endsWith: digits } });
        }
      }
    } else if (opts.phone) {
      const digits = opts.phone.replace(/\D/g, "").slice(-10);
      or.push({ patientPhone: opts.phone });
      if (digits.length >= 10) {
        or.push({ patientPhone: { endsWith: digits } });
      }
    }
    if (!or.length) {
      return [];
    }
    const where: Prisma.PracticeBookingWhereInput = {
      OR: or as Prisma.PracticeBookingWhereInput[],
    };
    if (opts.practiceId) where.practiceId = opts.practiceId;
    if (opts.statuses?.length) where.status = { in: opts.statuses };
    if (opts.updatedSince) where.updatedAt = { gte: opts.updatedSince };
    if (opts.upcomingOnly) {
      const now = new Date();
      where.AND = [
        {
          OR: [
            { slotStart: { gt: now } },
            { slotStart: null, sessionDate: { gte: startOfLocalDay(now) } },
          ],
        },
      ];
    }
    const bookings = await prisma.practiceBooking.findMany({
      where,
      include: {
        practice: {
          select: {
            id: true,
            name: true,
            slug: true,
            specialty: true,
            consultationFee: true,
          },
        },
        location: { select: { name: true, address: true, city: true } },
      },
      orderBy: [
        { slotStart: opts.order === "desc" ? "desc" : "asc" },
        { sessionDate: opts.order === "desc" ? "desc" : "asc" },
        { createdAt: "desc" },
      ],
      take: opts.take ?? 50,
    });

    const visible = bookings.filter((b) => {
      if (opts.patientId) {
        if (b.patientId === opts.patientId) return true;
        return (
          b.patientId == null &&
          Boolean(opts.phone) &&
          samePatientMobile(b.patientPhone, opts.phone)
        );
      }
      if (opts.phone) return samePatientMobile(b.patientPhone, opts.phone);
      return true;
    });

    // Batch providers — avoid N+1 enrichBooking (was 2–3 queries per row).
    const providerIds = [...new Set(visible.map((b) => b.providerId))];
    const providers = providerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: providerIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const providerMap = Object.fromEntries(providers.map((p) => [p.id, p]));

    return visible.map((b) => {
      const provider = providerMap[b.providerId];
      return {
        ...b,
        provider: provider
          ? { id: provider.id, name: provider.name, email: provider.email }
          : null,
      };
    });
  },

  async listForPractice(
    practiceId: string,
    opts?: {
      date?: string;
      from?: string;
      to?: string;
      providerId?: string;
    },
  ) {
    const where: Record<string, unknown> = { practiceId };
    const date = opts?.date;
    const from = opts?.from;
    const to = opts?.to;
    const providerId = opts?.providerId?.trim();

    if (providerId) {
      where.providerId = providerId;
    }

    if (from || to) {
      const rangeStart = parseLocalDate(from || to!);
      const rangeEnd = endOfLocalDay(parseLocalDate(to || from!));
      where.OR = [
        { slotStart: { gte: rangeStart, lte: rangeEnd } },
        {
          AND: [
            { sessionDate: { gte: rangeStart } },
            { sessionDate: { lte: rangeEnd } },
          ],
        },
      ];
    } else if (date) {
      const d = parseLocalDate(date);
      const dayEnd = endOfLocalDay(d);
      where.OR = [
        { slotStart: { gte: d, lte: dayEnd } },
        { sessionDate: d },
      ];
    }

    const bookings = await prisma.practiceBooking.findMany({
      where,
      orderBy: [{ slotStart: "asc" }, { tokenNumber: "asc" }],
      select: {
        id: true,
        practiceId: true,
        locationId: true,
        providerId: true,
        patientId: true,
        patientPhone: true,
        patientName: true,
        mode: true,
        status: true,
        channel: true,
        slotStart: true,
        slotEnd: true,
        tokenNumber: true,
        sessionDate: true,
        consultationType: true,
        disease: true,
        notes: true,
        doctorRemarks: true,
        medicines: true,
        documents: true,
        arrivedAt: true,
        paymentStatus: true,
        paymentAmount: true,
        paidAt: true,
        overrideSlot: true,
        overrideNote: true,
        cancelReason: true,
        createdAt: true,
        updatedAt: true,
        location: {
          select: { id: true, name: true, address: true, city: true },
        },
      },
    });

    const providerIds = [...new Set(bookings.map((b) => b.providerId))];
    const patientIds = [
      ...new Set(
        bookings.map((b) => b.patientId).filter((id): id is string => !!id),
      ),
    ];
    // Only resolve by phone when booking has no patientId (guest / legacy).
    const phones = [
      ...new Set(
        bookings
          .filter((b) => !b.patientId)
          .map((b) => b.patientPhone)
          .filter(Boolean),
      ),
    ];

    const [providers, patientsById, usersByPhone] = await Promise.all([
      providerIds.length
        ? prisma.user.findMany({
            where: { id: { in: providerIds } },
            select: { id: true, name: true, email: true },
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
                  emergencyNumber: true,
                  relationship: true,
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
                  emergencyNumber: true,
                  relationship: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const providerMap = Object.fromEntries(providers.map((p) => [p.id, p]));
    const patientById = Object.fromEntries(patientsById.map((p) => [p.id, p]));
    const patientByPhone = new Map<string, (typeof usersByPhone)[number]>();
    const phoneKey = (raw: string) => raw.replace(/\D/g, "").slice(-10);

    for (const u of usersByPhone) {
      if (u.phone) {
        patientByPhone.set(u.phone, u);
        const k = phoneKey(u.phone);
        if (k) patientByPhone.set(k, u);
      }
      if (u.patient?.contactNumber) {
        patientByPhone.set(u.patient.contactNumber, u);
        const k = phoneKey(u.patient.contactNumber);
        if (k) patientByPhone.set(k, u);
      }
    }

    return bookings.map((b) => {
      const linked =
        (b.patientId ? patientById[b.patientId] : undefined) ??
        patientByPhone.get(b.patientPhone) ??
        patientByPhone.get(phoneKey(b.patientPhone)) ??
        null;
      const provider = providerMap[b.providerId] ?? null;
      const dateOfBirth = linked?.patient?.dateOfBirth ?? null;

      const linkedName = String(linked?.name || "").trim();
      const storedName = String(b.patientName || "").trim();
      // Prefer a real person name over a blank / digit-only booking label.
      const displayName =
        (storedName && !/^\d{8,15}$/.test(storedName) ? storedName : "") ||
        linkedName ||
        storedName ||
        null;

      return {
        ...b,
        patientName: displayName,
        provider: provider
          ? { id: provider.id, name: provider.name, email: provider.email }
          : null,
        patient: linked
          ? {
              id: linked.id,
              name: linked.name,
              email: publicPatientEmail(linked.email),
              phone: linked.phone ?? linked.patient?.contactNumber ?? null,
              gender: linked.gender,
              address: publicPatientAddress(linked.address),
              imgSrc: linked.imgSrc,
              dateOfBirth,
              age: ageFromDob(dateOfBirth),
              contactNumber: linked.patient?.contactNumber ?? null,
              emergencyNumber: linked.patient?.emergencyNumber ?? null,
              mrn: linked.patient?.mrn ?? null,
              relationship: linked.patient?.relationship ?? null,
            }
          : {
              id: null,
              name: displayName,
              email: null,
              phone: b.patientPhone,
              gender: null,
              address: null,
              imgSrc: null,
              dateOfBirth: null,
              age: null,
              contactNumber: b.patientPhone,
              emergencyNumber: null,
              mrn: null,
              relationship: null,
            },
      };
    });
  },

  async getAvailability(
    practiceId: string,
    providerId: string,
    locationId: string,
    dateStr: string,
  ) {
    const { PracticeService } = await import("./practice.service.js");
    await PracticeService.applyDuePendingSchedule(providerId);

    const date = parseLocalDate(dateStr);
    if (Number.isNaN(date.getTime())) {
      throw new AppError(400, "invalid date");
    }

    const dayOfWeek = practiceWeekday(date);
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);

    const [schedules, bookings, overrides] = await Promise.all([
      loadSchedulesOn({ practiceId, providerId, locationId }, formatLocalDate(date)).then(
        (rows) => rows.filter((s) => s.dayOfWeek === dayOfWeek),
      ),
      prisma.practiceBooking.findMany({
        where: {
          practiceId,
          providerId,
          status: { notIn: [BookingStatus.CANCELED, BookingStatus.NO_SHOW] },
          OR: [
            { slotStart: { gte: dayStart, lte: dayEnd } },
            { sessionDate: dayStart },
          ],
        },
      }),
      prisma.scheduleOverride.findMany({
        where: { practiceId, providerId, date: dayStart },
      }),
    ]);

    const { today, maxDay, days } = getValidityBounds(PATIENT_BOOKING_HORIZON_DAYS);
    const withinValidity = isDateWithinValidity(date, PATIENT_BOOKING_HORIZON_DAYS);
    const configuredMode = resolveProviderBookingMode(schedules);
    const configuredModes = configuredMode ? [configuredMode] : [];
    const activeSchedules = schedulesForActiveMode(schedules);

    if (!withinValidity) {
      return {
        date: dateStr,
        appointmentValidityDays: days,
        bookableFrom: formatLocalDate(today),
        bookableUntil: formatLocalDate(maxDay),
        configuredMode,
        configuredModes,
        timeSlots: [],
        tokenSessions: [],
        outsideValidity: true,
      };
    }

    return {
      date: dateStr,
      appointmentValidityDays: days,
      bookableFrom: formatLocalDate(today),
      bookableUntil: formatLocalDate(maxDay),
      configuredMode,
      configuredModes,
      outsideValidity: false,
      timeSlots: timeSlotsForProviderDay(activeSchedules, date, bookings, overrides),
      tokenSessions: activeSchedules
        .filter((s) => s.mode === ScheduleMode.TOKEN_BASED)
        .map((s) => getTokenSession(s, date, bookings, overrides))
        .filter(Boolean),
    };
  },
};
