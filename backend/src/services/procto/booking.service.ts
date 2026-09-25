import { BookingChannel, BookingStatus, ScheduleMode } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError, ResponseHandler } from "../../core/response.js";
import { ageFromDob } from "../../core/dob.js";
import {
  publicPatientAddress,
  publicPatientEmail,
} from "../../core/patientDisplay.js";
import {
  assignNextToken,
  endOfLocalDay,
  formatLocalDate,
  getTokenSession,
  getValidityBounds,
  hasExtraSlotsForDay,
  isDateWithinValidity,
  parseLocalDate,
  resolveProviderBookingMode,
  sameLocalSlot,
  schedulesForActiveMode,
  startOfLocalDay,
  timeSlotsForProviderDay,
} from "./slotEngine.js";
import { NotificationService } from "./notification.service.js";
import { broadcastProctoEvent, serializeBooking } from "./proctoSocket.js";

const MAX_BOOKING_DOCUMENTS = 5;

const BOOKING_STATUSES = new Set<string>(Object.values(BookingStatus));
const BOOKING_CHANNELS = new Set<string>(Object.values(BookingChannel));

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

function normalizeMedicines(
  raw?: Array<{
    name?: string;
    amount?: string;
    dose?: string;
    times?: string[];
    frequency?: string;
  }> | null,
) {
  return (raw ?? [])
    .map((m) => {
      const amount =
        (m.amount ? String(m.amount).trim() : "") ||
        (m.dose ? String(m.dose).trim() : "") ||
        undefined;
      let times: string[] | undefined = Array.isArray(m.times)
        ? m.times.map(String)
        : undefined;
      if ((!times || times.length === 0) && m.frequency) {
        times = [String(m.frequency).trim()].filter(Boolean);
      }
      return {
        name: String(m.name || "").trim(),
        amount,
        times,
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
    .filter((d) => d.url.length > 0)
    .slice(0, MAX_BOOKING_DOCUMENTS);
}

export const BookingService = {
  async createBooking(data: {
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
  }) {
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

    const dayOfWeek = date.getDay();
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);

    // Parallel fetch: validity + schedule context + membership/location checks
    const [doctor, allSchedules, location, member] = await Promise.all([
      prisma.doctor.findUnique({
        where: { id: data.providerId },
        select: { appointmentValidityDays: true },
      }),
      prisma.providerSchedule.findMany({
        where: {
          practiceId: data.practiceId,
          providerId: data.providerId,
          locationId: data.locationId,
          isActive: true,
        },
      }),
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

    const validityDays = doctor?.appointmentValidityDays ?? 7;
    if (!isDateWithinValidity(date, validityDays)) {
      throw new AppError(
        400,
        `appointments can only be booked within ${validityDays} day(s)`,
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

    // Serialize capacity check + create to reduce double-booking races
    const booking = await prisma.$transaction(async (tx) => {
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

      let slotStart: Date | undefined;
      let slotEnd: Date | undefined;
      let tokenNumber: number | undefined;
      let sessionDate: Date | undefined;

      if (mode === ScheduleMode.TIME_BASED) {
        const startIso = data.slotStart!;
        slotStart = new Date(startIso);
        if (Number.isNaN(slotStart.getTime()) || slotStart.getTime() <= Date.now()) {
          throw new AppError(400, "slot must be in the future.");
        }

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
        if (!match?.available) {
          throw new AppError(409, "selected slot is not available.");
        }
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

  async updateStatus(
    bookingId: string,
    status: BookingStatus,
    actorUserId?: string,
    opts?: { skipPatientNotification?: boolean },
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

    const updated = await prisma.practiceBooking.update({
      where: { id: bookingId },
      data: { status: normalized },
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
  ) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    const existing = booking!;

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

    const oldWhen =
      existing.mode === ScheduleMode.TOKEN_BASED
        ? `Token #${existing.tokenNumber ?? "?"} on ${existing.sessionDate?.toISOString().slice(0, 10) ?? "?"}`
        : existing.slotStart?.toLocaleString() ?? "";

    let date: Date;
    if (existing.mode === ScheduleMode.TOKEN_BASED) {
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

    const dayOfWeek = date.getDay();
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);

    const allSchedules = await prisma.providerSchedule.findMany({
      where: {
        practiceId: existing.practiceId,
        providerId: existing.providerId,
        locationId: existing.locationId,
        isActive: true,
      },
    });
    const schedule = allSchedules.find(
      (s) => s.dayOfWeek === dayOfWeek && s.mode === existing.mode,
    );
    if (!schedule && existing.mode === ScheduleMode.TOKEN_BASED) {
      throw new AppError(404, "no schedule configured for this day.");
    }

    const updated = await prisma.$transaction(async (tx) => {
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

      let slotStart: Date | null = null;
      let slotEnd: Date | null = null;
      let tokenNumber: number | null = null;
      let sessionDate: Date | null = null;

      if (existing.mode === ScheduleMode.TIME_BASED) {
        slotStart = new Date(data.slotStart!);
        if (Number.isNaN(slotStart.getTime()) || slotStart.getTime() <= Date.now()) {
          throw new AppError(400, "slot must be in the future.");
        }
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
        if (!match?.available) {
          throw new AppError(409, "selected slot is not available.");
        }
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
          slotStart,
          slotEnd,
          tokenNumber,
          sessionDate,
          status: BookingStatus.ACCEPTED,
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

  async updateVisit(
    bookingId: string,
    data: {
      doctorRemarks?: string | null;
      medicines?: Array<{
        name: string;
        amount?: string;
        dose?: string;
        times?: string[];
        frequency?: string;
      }>;
      documents?: Array<{ name: string; url: string; uploadedAt?: string }>;
      status?: BookingStatus;
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

    if (
      existing.status === BookingStatus.COMPLETED ||
      existing.status === BookingStatus.CANCELED ||
      existing.status === BookingStatus.NO_SHOW
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
    const nextStatus = data.status ? parseBookingStatus(data.status) : undefined;

    const prevMedsKey = JSON.stringify(existing.medicines ?? []);
    const nextMedsKey = JSON.stringify(medicines ?? existing.medicines ?? []);
    const medicinesChanged =
      data.medicines !== undefined && prevMedsKey !== nextMedsKey;
    const hasMedicines =
      (medicines ?? (Array.isArray(existing.medicines) ? existing.medicines : []))
        .length > 0;

    const updated = await prisma.practiceBooking.update({
      where: { id: bookingId },
      data: {
        ...(data.doctorRemarks !== undefined
          ? { doctorRemarks: data.doctorRemarks?.trim() || null }
          : {}),
        ...(medicines !== undefined ? { medicines } : {}),
        ...(documents !== undefined ? { documents } : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
      },
      include: {
        practice: {
          select: { name: true, slug: true, specialty: true, consultationFee: true },
        },
        location: { select: { name: true, address: true, city: true } },
      },
    });

    if (nextStatus === BookingStatus.IN_PROGRESS) {
      void NotificationService.enqueueQueueAlert(bookingId).catch(() => undefined);
    }
    if (nextStatus === BookingStatus.CANCELED) {
      void NotificationService.enqueueCancellation(bookingId).catch(() => undefined);
    }
    if (nextStatus === BookingStatus.COMPLETED) {
      void NotificationService.enqueueVisitSummary(bookingId).catch((err) =>
        console.warn("visit summary notification failed (non-fatal):", err),
      );
    } else if (medicinesChanged && hasMedicines) {
      // Mid-visit prescription save → patient WhatsApp (finish uses VISIT_SUMMARY).
      void NotificationService.enqueuePrescriptionUpdate(bookingId).catch((err) =>
        console.warn("prescription WhatsApp notify failed (non-fatal):", err),
      );
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

    return this.enrichBooking(updated);
  },

  async getById(bookingId: string) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      include: {
        practice: { select: { id: true, name: true, slug: true, specialty: true, consultationFee: true } },
        location: { select: { name: true, address: true, city: true } },
      },
    });
    if (!booking) ResponseHandler.notFoundError("booking not found.");
    return this.enrichBooking(booking!);
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
                  dateOfBirth: true,
                  contactNumber: true,
                  emergencyNumber: true,
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
              dateOfBirth: true,
              contactNumber: true,
              emergencyNumber: true,
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

  async listForPatient(opts: { phone?: string; patientId?: string }) {
    const or: Record<string, unknown>[] = [];
    if (opts.patientId) {
      or.push({ patientId: opts.patientId });
    }
    if (opts.phone) {
      const digits = opts.phone.replace(/\D/g, "").slice(-10);
      or.push({ patientPhone: opts.phone });
      if (digits.length >= 10) {
        or.push({ patientPhone: { endsWith: digits } });
      }
    }
    if (!or.length) {
      return [];
    }
    const bookings = await prisma.practiceBooking.findMany({
      where: { OR: or },
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
      orderBy: [{ slotStart: "asc" }, { sessionDate: "asc" }, { createdAt: "desc" }],
      take: 50,
    });

    // Batch providers — avoid N+1 enrichBooking (was 2–3 queries per row).
    const providerIds = [...new Set(bookings.map((b) => b.providerId))];
    const providers = providerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: providerIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const providerMap = Object.fromEntries(providers.map((p) => [p.id, p]));

    return bookings.map((b) => {
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
                  dateOfBirth: true,
                  contactNumber: true,
                  emergencyNumber: true,
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
                  dateOfBirth: true,
                  contactNumber: true,
                  emergencyNumber: true,
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

      return {
        ...b,
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
            }
          : {
              id: null,
              name: b.patientName,
              email: null,
              phone: b.patientPhone,
              gender: null,
              address: null,
              imgSrc: null,
              dateOfBirth: null,
              age: null,
              contactNumber: b.patientPhone,
              emergencyNumber: null,
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
    const date = parseLocalDate(dateStr);
    if (Number.isNaN(date.getTime())) {
      throw new AppError(400, "invalid date");
    }

    const dayOfWeek = date.getDay();
    const dayStart = startOfLocalDay(date);
    const dayEnd = endOfLocalDay(date);

    const [doctor, schedules, bookings, overrides] = await Promise.all([
      prisma.doctor.findUnique({
        where: { id: providerId },
        select: { appointmentValidityDays: true },
      }),
      prisma.providerSchedule.findMany({
        where: { practiceId, providerId, locationId, dayOfWeek, isActive: true },
      }),
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

    const validityDays = doctor?.appointmentValidityDays ?? 7;
    const { today, maxDay, days } = getValidityBounds(validityDays);
    const withinValidity = isDateWithinValidity(date, validityDays);
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
