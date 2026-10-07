import { NotificationType } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { formatPracticeDateTime, formatLocalDate } from "./slotEngine.js";
import { enqueueNotificationEvent } from "../../workers/notificationQueue.js";

export type NotifyOpts = {
  /** Bot already sent a short in-session ack — skip duplicate patient UTILITY template. */
  skipPatientTemplate?: boolean;
  /** Clinic inbox row already written (patient alert sent later). */
  skipClinicInbox?: boolean;
};

/** Human-facing place line for WhatsApp / confirmations (prefer street address over branch label). */
export function formatBookingLocation(loc: {
  name?: string | null;
  address?: string | null;
  city?: string | null;
}): string {
  const name = String(loc.name || "").trim();
  const address = String(loc.address || "").trim();
  const city = String(loc.city || "").trim();

  const placeParts: string[] = [];
  if (address) placeParts.push(address);
  if (city && !address.toLowerCase().includes(city.toLowerCase())) {
    placeParts.push(city);
  }
  const place = placeParts.join(", ");

  const genericName =
    !name ||
    /^(main\s*clinic|primary|default|head\s*office|branch\s*1)$/i.test(name);

  if (place) {
    if (!genericName && !place.toLowerCase().includes(name.toLowerCase())) {
      return `${name} — ${place}`;
    }
    return place;
  }
  return name || "clinic";
}

async function loadBooking(bookingId: string) {
  const booking = await prisma.practiceBooking.findUnique({
    where: { id: bookingId },
    include: {
      practice: true,
      location: true,
    },
  });
  if (!booking) return null;
  const provider = await prisma.user.findUnique({
    where: { id: booking.providerId },
    select: { id: true, name: true, phone: true },
  });
  return { ...booking, provider };
}

function whenFields(booking: {
  mode: string;
  slotStart?: Date | null;
  tokenNumber?: number | null;
  sessionDate?: Date | null;
}) {
  return {
    mode: booking.mode,
    slotStart: booking.slotStart?.toISOString(),
    tokenNumber: booking.tokenNumber,
    sessionDate: booking.sessionDate?.toISOString().slice(0, 10),
    whenLabel:
      booking.mode === "TOKEN_BASED"
        ? `Token #${booking.tokenNumber ?? "?"} on ${
            booking.sessionDate
              ? formatLocalDate(booking.sessionDate)
              : "?"
          }`
        : booking.slotStart
          ? formatPracticeDateTime(booking.slotStart)
          : "scheduled time",
  };
}

function formatMedicinesPreview(
  medicines: Array<{
    name?: string;
    amount?: string;
    times?: string[];
  }>,
): string {
  const medLines = medicines
    .map((m) => {
      const name = String(m.name || "").trim();
      if (!name) return "";
      const dose = String(m.amount || "").trim();
      const times = Array.isArray(m.times)
        ? m.times.filter(Boolean).join(", ")
        : "";
      return [name, dose, times].filter(Boolean).join(" — ");
    })
    .filter(Boolean);

  if (medLines.length === 0) return "None prescribed";
  return medLines.join("; ").slice(0, 280);
}

function last10Digits(phone: string | null | undefined): string {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

/** Prefer practice phone, then owner/doctor user phone. */
export async function resolveClinicNotifyPhone(practiceId: string): Promise<string | null> {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { phone: true },
  });
  if (practice?.phone?.trim()) return last10Digits(practice.phone);

  const owner = await prisma.practiceMember.findFirst({
    where: {
      practiceId,
      isActive: true,
      role: { in: ["PRACTICE_OWNER", "DOCTOR"] },
    },
    include: { user: { select: { phone: true } } },
    orderBy: { role: "asc" },
  });
  const phone = last10Digits(owner?.user?.phone);
  return phone || null;
}

/**
 * True when `phone` is this practice's WhatsApp bot (or the platform OTP line).
 * Meta rejects sends to your own phone id (#100) — clinic inbox must stay in-app.
 */
export async function isClinicWhatsAppBotPhone(
  practiceId: string,
  phone: string | null | undefined,
): Promise<boolean> {
  const digits = last10Digits(phone);
  if (digits.length < 10) return false;

  const wa = await prisma.whatsAppNumber.findFirst({
    where: { practiceId },
    select: { phoneNumber: true },
    orderBy: { updatedAt: "desc" },
  });
  if (wa?.phoneNumber && last10Digits(wa.phoneNumber) === digits) return true;

  const { settings } = await import("../../config/index.js");
  const otp = last10Digits(settings.glucoguideOtpPhone);
  return Boolean(otp && otp === digits);
}

async function createAndEnqueue(data: {
  practiceId: string;
  bookingId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
}) {
  try {
    const event = await prisma.notificationEvent.create({
      data: {
        practiceId: data.practiceId,
        bookingId: data.bookingId,
        type: data.type,
        channel: "WHATSAPP",
        status: "PENDING",
        payload: data.payload as object,
      },
    });
    void enqueueNotificationEvent(event.id);

    // Live refresh for practice Notifications tab.
    const role = String(data.payload.recipientRole || "");
    const templateKey = String(data.payload.templateKey || "");
    const inboxVisible =
      role === "clinic" ||
      (role === "patient" &&
        (PATIENT_OUTBOUND_INBOX_KEYS as readonly string[]).includes(
          templateKey,
        ));
    if (inboxVisible) {
      void import("./proctoSocket.js")
        .then(({ broadcastProctoEvent }) =>
          broadcastProctoEvent(data.practiceId, {
            event: "notification_created",
            notification: {
              id: event.id,
              practice_id: data.practiceId,
              booking_id: data.bookingId,
              template_key: templateKey,
              recipient_role: role,
              created_at: event.createdAt.toISOString(),
            },
          }),
        )
        .catch(() => undefined);
    }

    return event;
  } catch (error) {
    console.warn("notification enqueue skipped:", error);
    return null;
  }
}

/** One undismissed clinic row per booking for these keys (create + ACCEPTED both confirm). */
const IDEMPOTENT_CLINIC_TEMPLATE_KEYS = new Set([
  "CLINIC_NEW_BOOKING",
  "CLINIC_CANCEL",
  "CLINIC_RESCHEDULE",
  "CLINIC_QUEUE_ALERT",
  "CLINIC_WAITING",
  "CLINIC_NO_SHOW",
  "CLINIC_COMPLETED",
]);

/** Keys never shown on the practice Notifications tab. */
const EXCLUDED_INBOX_TEMPLATE_KEYS = [
  "CLINIC_COMPLETED",
  "VISIT_SUMMARY",
] as const;

/**
 * Clinic-facing inbox rows: appointments, inbound patient messages, attachments,
 * and staff→patient care-chat audits.
 */
const CLINIC_INBOX_TEMPLATE_KEYS = [
  "CLINIC_NEW_BOOKING",
  "CLINIC_CANCEL",
  "CLINIC_RESCHEDULE",
  "CLINIC_MESSAGE",
  "CLINIC_DOCUMENT",
  "CLINIC_OUTBOUND_MESSAGE",
] as const;

/**
 * Patient-bound WhatsApp sends shown under "Message to patient"
 * (excludes VISIT_SUMMARY).
 */
const PATIENT_OUTBOUND_INBOX_KEYS = [
  "BOOKING_CONFIRMATION",
  "CANCELLATION",
  "REMINDER",
  "REMINDER_24H",
  "RESCHEDULE",
  "PRESCRIPTION_UPDATE",
  "QUEUE_ALERT",
  "OVERRIDE_IMPACT",
] as const;

/**
 * Always write a clinic inbox row. WhatsApp send is optional — if there is no
 * clinic phone, the worker marks the event SKIPPED (in-app only) so status /
 * docs / support still appear on Notifications.
 *
 * Idempotent for booking lifecycle keys while undismissed — create + ACCEPTED
 * both call confirmation and must not double the badge / list. Messages and
 * documents stay multi-row.
 */
async function enqueueClinicInbox(data: {
  practiceId: string;
  bookingId: string;
  type: NotificationType;
  templateKey: string;
  payload: Record<string, unknown>;
  /** Never WhatsApp the clinic — in-app Notifications row only. */
  inAppOnly?: boolean;
}) {
  if (
    data.bookingId &&
    IDEMPOTENT_CLINIC_TEMPLATE_KEYS.has(data.templateKey)
  ) {
    const existing = await prisma.notificationEvent.findFirst({
      where: {
        practiceId: data.practiceId,
        bookingId: data.bookingId,
        dismissedAt: null,
        AND: [
          { payload: { path: ["recipientRole"], equals: "clinic" } },
          { payload: { path: ["templateKey"], equals: data.templateKey } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
  }

  const forceInApp = Boolean(data.inAppOnly);
  const clinicTo = forceInApp
    ? ""
    : await resolveClinicNotifyPhone(data.practiceId);
  // Never WhatsApp the clinic bot number itself — Meta (#100) + no human inbox.
  const botSelf =
    Boolean(clinicTo) &&
    (await isClinicWhatsAppBotPhone(data.practiceId, clinicTo));
  const inAppOnly = forceInApp || !clinicTo || botSelf;
  return createAndEnqueue({
    practiceId: data.practiceId,
    bookingId: data.bookingId,
    type: data.type,
    payload: {
      ...data.payload,
      to: inAppOnly ? "" : clinicTo || "",
      templateKey: data.templateKey,
      recipientRole: "clinic",
      inAppOnly,
      ...(botSelf ? { error: "clinic phone is WhatsApp bot — inbox only" } : {}),
    },
  });
}

/** Queues WhatsApp notifications via BullMQ worker. Never blocks HTTP. */
export const NotificationService = {
  async enqueueConfirmation(bookingId: string, opts?: NotifyOpts) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const base = {
      practiceName: booking.practice.name,
      location: formatBookingLocation(booking.location),
      providerName: booking.provider?.name ?? "",
      patientName: booking.patientName ?? "Patient",
      patientPhone: booking.patientPhone,
      channel: booking.channel,
      ...whenFields(booking),
    };

    if (!opts?.skipPatientTemplate) {
      await createAndEnqueue({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.BOOKING_CONFIRMATION,
        payload: {
          to: booking.patientPhone,
          templateKey: "BOOKING_CONFIRMATION",
          recipientRole: "patient",
          ...base,
        },
      });
    }

    await enqueueClinicInbox({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.BOOKING_CONFIRMATION,
      templateKey: "CLINIC_NEW_BOOKING",
      payload: { ...base },
    });

    return true;
  },

  async enqueueCancellation(bookingId: string, opts?: NotifyOpts) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const base = {
      practiceName: booking.practice.name,
      providerName: booking.provider?.name ?? "",
      patientName: booking.patientName ?? "Patient",
      patientPhone: booking.patientPhone,
      ...whenFields(booking),
    };

    if (!opts?.skipPatientTemplate) {
      await createAndEnqueue({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.CANCELLATION,
        payload: {
          to: booking.patientPhone,
          templateKey: "CANCELLATION",
          recipientRole: "patient",
          ...base,
        },
      });
    }

    if (!opts?.skipClinicInbox) {
      await enqueueClinicInbox({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.CANCELLATION,
        templateKey: "CLINIC_CANCEL",
        payload: { ...base },
      });
    }

    return true;
  },

  async enqueueReminder(
    bookingId: string,
    opts?: { kind?: "soon" | "24h" },
  ) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const { getPracticeEntitlement, hasFeatureFlag } = await import(
      "./planEntitlements.js"
    );
    const ent = await getPracticeEntitlement(booking.practiceId);
    if (!ent.usable || !hasFeatureFlag(ent.features, "reminders")) {
      return null;
    }

    const kind = opts?.kind === "24h" ? "24h" : "soon";
    const templateKey = kind === "24h" ? "REMINDER_24H" : "REMINDER";

    const already = await prisma.notificationEvent.findFirst({
      where: {
        bookingId: booking.id,
        type: NotificationType.REMINDER,
        status: { in: ["PENDING", "SENT"] },
        payload: { path: ["templateKey"], equals: templateKey },
      },
      select: { id: true },
    });
    if (already) return already;

    return createAndEnqueue({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.REMINDER,
      payload: {
        to: booking.patientPhone,
        templateKey,
        reminderKind: kind,
        recipientRole: "patient",
        practiceName: booking.practice.name,
        providerName: booking.provider?.name ?? "",
        location: formatBookingLocation(booking.location),
        ...whenFields(booking),
      },
    });
  },

  async enqueueReschedule(bookingId: string, oldWhen?: string, opts?: NotifyOpts) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const base = {
      practiceName: booking.practice.name,
      providerName: booking.provider?.name ?? "",
      patientName: booking.patientName ?? "Patient",
      patientPhone: booking.patientPhone,
      oldWhen: oldWhen ?? "",
      ...whenFields(booking),
    };

    if (!opts?.skipPatientTemplate) {
      await createAndEnqueue({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.RESCHEDULE,
        payload: {
          to: booking.patientPhone,
          templateKey: "RESCHEDULE",
          recipientRole: "patient",
          ...base,
        },
      });
    }

    if (!opts?.skipClinicInbox) {
      await enqueueClinicInbox({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.RESCHEDULE,
        templateKey: "CLINIC_RESCHEDULE",
        payload: { ...base },
      });
    }

    return true;
  },

  async enqueueOverrideImpact(
    bookingId: string,
    reason?: string,
    opts?: NotifyOpts,
  ) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const base = {
      practiceName: booking.practice.name,
      providerName: booking.provider?.name ?? "",
      patientName: booking.patientName ?? "Patient",
      patientPhone: booking.patientPhone,
      reason: reason ?? "",
      ...whenFields(booking),
    };

    if (!opts?.skipPatientTemplate) {
      await createAndEnqueue({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.RESCHEDULE,
        payload: {
          to: booking.patientPhone,
          templateKey: "OVERRIDE_IMPACT",
          recipientRole: "patient",
          ...base,
        },
      });
    }

    if (opts?.skipClinicInbox) return true;
    await enqueueClinicInbox({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.RESCHEDULE,
      templateKey: "CLINIC_OVERRIDE",
      payload: { ...base },
    });

    return true;
  },

  async enqueueQueueAlert(bookingId: string) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const base = {
      practiceName: booking.practice.name,
      patientName: booking.patientName ?? "Patient",
      patientPhone: booking.patientPhone,
      ...whenFields(booking),
    };

    await createAndEnqueue({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.QUEUE_ALERT,
      payload: {
        to: booking.patientPhone,
        templateKey: "QUEUE_ALERT",
        recipientRole: "patient",
        ...base,
      },
    });

    await enqueueClinicInbox({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.QUEUE_ALERT,
      templateKey: "CLINIC_QUEUE_ALERT",
      payload: { ...base },
    });

    return true;
  },

  async enqueueClinicModeChange(opts: {
    practiceId: string;
    bookingId: string;
    providerName?: string | null;
    fromLabel: string;
    toLabel: string;
    effectiveDate: string;
  }) {
    return enqueueClinicInbox({
      practiceId: opts.practiceId,
      bookingId: opts.bookingId,
      type: NotificationType.RESCHEDULE,
      templateKey: "CLINIC_MODE_CHANGE",
      payload: {
        providerName: opts.providerName ?? "",
        patientName: opts.providerName ?? "Doctor",
        patientPhone: "",
        fromLabel: opts.fromLabel,
        toLabel: opts.toLabel,
        effectiveDate: opts.effectiveDate,
        reason: `Booking type changes to ${opts.toLabel} from ${opts.effectiveDate}`,
      },
    });
  },

  /** Patient WhatsApp + app: visit remarks / medicines / documents after finish. */
  async enqueueVisitSummary(bookingId: string) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const medicines = Array.isArray(booking.medicines)
      ? (booking.medicines as Array<{
          name?: string;
          amount?: string;
          times?: string[];
        }>)
      : [];
    const documents = Array.isArray(booking.documents)
      ? (booking.documents as Array<{ name?: string; url?: string }>)
      : [];

    const medicinesPreview = formatMedicinesPreview(medicines);
    const remarks = String(booking.doctorRemarks || "").trim();
    const remarksPreview = remarks
      ? remarks.length > 220
        ? `${remarks.slice(0, 219)}…`
        : remarks
      : "None noted";
    const documentsPreview =
      documents.length === 0
        ? "None attached"
        : `${documents.length} file(s) — view in GlucoGuide app`;

    return createAndEnqueue({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      // Reuse enum value; worker routes by payload.templateKey.
      type: NotificationType.BOOKING_CONFIRMATION,
      payload: {
        to: booking.patientPhone,
        templateKey: "VISIT_SUMMARY",
        recipientRole: "patient",
        practiceName: booking.practice.name,
        providerName: booking.provider?.name ?? "",
        remarksPreview,
        medicinesPreview,
        documentsPreview,
        ...whenFields(booking),
      },
    });
  },

  /**
   * Patient WhatsApp: prescription / medicines when the doctor saves them
   * during an open visit (before finish). Finish still sends VISIT_SUMMARY.
   */
  async enqueuePrescriptionUpdate(bookingId: string) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const medicines = Array.isArray(booking.medicines)
      ? (booking.medicines as Array<{
          name?: string;
          amount?: string;
          times?: string[];
        }>)
      : [];
    if (!medicines.length) return null;

    const medicinesPreview = formatMedicinesPreview(medicines);
    if (!medicinesPreview || medicinesPreview === "None prescribed") {
      return null;
    }

    return createAndEnqueue({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.BOOKING_CONFIRMATION,
      payload: {
        to: booking.patientPhone,
        templateKey: "PRESCRIPTION_UPDATE",
        recipientRole: "patient",
        practiceName: booking.practice.name,
        providerName: booking.provider?.name ?? "",
        medicinesPreview,
        ...whenFields(booking),
      },
    });
  },

  /**
   * Clinic inbox for queue status — WAITING / NO_SHOW only.
   * Visit completed is intentionally omitted from the Notifications tab.
   */
  async enqueueClinicStatusChange(
    bookingId: string,
    status: "WAITING" | "NO_SHOW" | "COMPLETED",
  ) {
    if (status === "COMPLETED") return null;

    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const templateKey =
      status === "WAITING" ? "CLINIC_WAITING" : "CLINIC_NO_SHOW";

    return enqueueClinicInbox({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.QUEUE_ALERT,
      templateKey,
      payload: {
        practiceName: booking.practice.name,
        providerName: booking.provider?.name ?? "",
        patientName: booking.patientName ?? "Patient",
        patientPhone: booking.patientPhone,
        statusLabel:
          status === "WAITING" ? "arrived / waiting" : "no-show",
        ...whenFields(booking),
      },
    });
  },

  /**
   * Clinic inbox when a patient shares a visit or general document via WhatsApp.
   * `bookingId` anchors the NotificationEvent (required by schema).
   */
  async enqueueClinicDocumentAttached(
    bookingId: string,
    docName: string,
    opts?: { kind?: "visit" | "general" },
  ) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const kind = opts?.kind === "general" ? "general" : "visit";
    return enqueueClinicInbox({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.QUEUE_ALERT,
      templateKey: "CLINIC_DOCUMENT",
      payload: {
        practiceName: booking.practice.name,
        providerName: booking.provider?.name ?? "",
        patientName: booking.patientName ?? "Patient",
        patientPhone: booking.patientPhone,
        docName: String(docName || "Document").trim() || "Document",
        docKind: kind,
        ...whenFields(booking),
      },
    });
  },

  /**
   * Clinic inbox when a patient taps Talk to Support / Agent on WhatsApp.
   * Anchors to the patient's latest practice booking when one exists.
   */
  async enqueueClinicSupportRequest(opts: {
    practiceId: string;
    patientPhone: string;
    patientName?: string | null;
  }) {
    const digits = String(opts.patientPhone || "")
      .replace(/\D/g, "")
      .slice(-10);
    if (!digits) return null;

    const bookingRow = await prisma.practiceBooking.findFirst({
      where: {
        practiceId: opts.practiceId,
        patientPhone: { endsWith: digits },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!bookingRow) return null;

    const booking = await loadBooking(bookingRow.id);
    if (!booking) return null;

    return enqueueClinicInbox({
      practiceId: opts.practiceId,
      bookingId: booking.id,
      type: NotificationType.QUEUE_ALERT,
      templateKey: "CLINIC_SUPPORT",
      payload: {
        practiceName: booking.practice.name,
        providerName: booking.provider?.name ?? "",
        patientName:
          opts.patientName?.trim() ||
          booking.patientName ||
          "Patient",
        patientPhone: booking.patientPhone,
        supportLabel: "Talk to Support / Agent",
        ...whenFields(booking),
      },
    });
  },

  /**
   * Clinic inbox when a patient messages the doctor (app care chat or WhatsApp).
   */
  async enqueueClinicPatientMessage(opts: {
    practiceId: string;
    bookingId: string;
    messagePreview: string;
    channel: "whatsapp" | "app";
    patientName?: string | null;
    patientPhone?: string | null;
    providerName?: string | null;
  }) {
    const preview = String(opts.messagePreview || "").trim();
    if (!preview) return null;
    const booking = await loadBooking(opts.bookingId);
    if (!booking || booking.practiceId !== opts.practiceId) return null;

    return enqueueClinicInbox({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.QUEUE_ALERT,
      templateKey: "CLINIC_MESSAGE",
      payload: {
        practiceName: booking.practice.name,
        providerName:
          opts.providerName?.trim() || booking.provider?.name || "",
        patientName:
          opts.patientName?.trim() || booking.patientName || "Patient",
        patientPhone: opts.patientPhone?.trim() || booking.patientPhone,
        messagePreview:
          preview.length > 200 ? `${preview.slice(0, 199)}…` : preview,
        messageChannel: opts.channel,
        ...whenFields(booking),
      },
    });
  },

  /**
   * Clinic inbox audit when staff messages a patient (care chat → WhatsApp fan-out).
   * In-app only — WhatsApp delivery is handled by the care-chat fan-out path.
   */
  async enqueueClinicOutboundMessage(opts: {
    practiceId: string;
    bookingId: string;
    messagePreview: string;
    channel: "whatsapp" | "app";
    patientName?: string | null;
    patientPhone?: string | null;
    providerName?: string | null;
  }) {
    const preview = String(opts.messagePreview || "").trim();
    if (!preview) return null;
    const booking = await loadBooking(opts.bookingId);
    if (!booking || booking.practiceId !== opts.practiceId) return null;

    return enqueueClinicInbox({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.QUEUE_ALERT,
      templateKey: "CLINIC_OUTBOUND_MESSAGE",
      inAppOnly: true,
      payload: {
        practiceName: booking.practice.name,
        providerName:
          opts.providerName?.trim() || booking.provider?.name || "",
        patientName:
          opts.patientName?.trim() || booking.patientName || "Patient",
        patientPhone: opts.patientPhone?.trim() || booking.patientPhone,
        messagePreview:
          preview.length > 200 ? `${preview.slice(0, 199)}…` : preview,
        messageChannel: opts.channel,
        ...whenFields(booking),
      },
    });
  },

  /**
   * Practice Notifications inbox:
   * - Appointments / bookings (clinic)
   * - Messages from patient
   * - Attachments
   * - Message to patient (care chat + patient WhatsApp utilities)
   * Excludes visit completed and visit summary sent.
   */
  async listForPractice(
    practiceId: string,
    actorUserId: string,
    opts?: {
      status?: string;
      kind?: string;
      take?: number;
      skip?: number;
    },
  ) {
    const { PracticeService } = await import("./practice.service.js");
    await PracticeService.assertMember(practiceId, actorUserId);

    const take = Math.min(opts?.take ?? 50, 100);
    const skip = opts?.skip ?? 0;
    const statusFilter =
      opts?.status && opts.status !== "ALL" ? opts.status.trim() : undefined;
    const scope = clinicInboxKindScope(opts?.kind);

    const templateOr = (keys: readonly string[]) =>
      keys.map((key) => ({
        payload: { path: ["templateKey"], equals: key },
      }));

    const recipientClauses: object[] = [];
    if (scope.clinicKeys.length) {
      recipientClauses.push({
        AND: [
          { payload: { path: ["recipientRole"], equals: "clinic" } },
          { OR: templateOr(scope.clinicKeys) },
        ],
      });
    }
    if (scope.patientKeys.length) {
      recipientClauses.push({
        AND: [
          { payload: { path: ["recipientRole"], equals: "patient" } },
          { OR: templateOr(scope.patientKeys) },
        ],
      });
    }

    const where = {
      practiceId,
      dismissedAt: null as Date | null,
      ...(statusFilter ? { status: statusFilter } : {}),
      AND: [
        ...(recipientClauses.length ? [{ OR: recipientClauses }] : []),
        {
          NOT: {
            OR: EXCLUDED_INBOX_TEMPLATE_KEYS.map((key) => ({
              payload: { path: ["templateKey"], equals: key },
            })),
          },
        },
      ],
    };

    const [rawItems, totalRaw, statusGroups] = await Promise.all([
      prisma.notificationEvent.findMany({
        where,
        take: Math.min(take * 3, 150),
        skip,
        orderBy: { createdAt: "desc" },
        include: {
          booking: {
            select: {
              id: true,
              patientPhone: true,
              patientName: true,
              status: true,
              slotStart: true,
              sessionDate: true,
              providerId: true,
            },
          },
        },
      }),
      prisma.notificationEvent.count({ where }),
      prisma.notificationEvent.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ]);

    // Collapse legacy duplicates (e.g. create + ACCEPTED both wrote CLINIC_NEW_BOOKING).
    const seenLifecycle = new Set<string>();
    const staleDuplicateIds: string[] = [];
    const deduped = [];
    for (const n of rawItems) {
      const payload =
        n.payload && typeof n.payload === "object"
          ? (n.payload as Record<string, unknown>)
          : {};
      const templateKey = String(payload.templateKey || n.type);
      if (
        n.bookingId &&
        IDEMPOTENT_CLINIC_TEMPLATE_KEYS.has(templateKey)
      ) {
        const sig = `${n.bookingId}|${templateKey}`;
        if (seenLifecycle.has(sig)) {
          staleDuplicateIds.push(n.id);
          continue;
        }
        seenLifecycle.add(sig);
      }
      deduped.push(n);
    }
    if (staleDuplicateIds.length) {
      void prisma.notificationEvent
        .updateMany({
          where: { id: { in: staleDuplicateIds } },
          data: { dismissedAt: new Date() },
        })
        .catch(() => undefined);
    }

    const items = deduped.slice(0, take);
    const total = Math.max(0, totalRaw - staleDuplicateIds.length);

    let pendingCount = 0;
    let failedCount = 0;
    let sentCount = 0;
    for (const row of statusGroups) {
      const n = row._count._all;
      if (row.status === "PENDING") pendingCount = n;
      else if (row.status === "FAILED") failedCount = n;
      else if (row.status === "SENT") sentCount = n;
    }
    if (staleDuplicateIds.length) {
      const droppedStatuses = new Map(
        rawItems
          .filter((n) => staleDuplicateIds.includes(n.id))
          .map((n) => [n.id, n.status]),
      );
      for (const status of droppedStatuses.values()) {
        if (status === "PENDING") pendingCount = Math.max(0, pendingCount - 1);
        else if (status === "FAILED")
          failedCount = Math.max(0, failedCount - 1);
        else if (status === "SENT") sentCount = Math.max(0, sentCount - 1);
      }
    }

    return {
      total,
      pendingCount,
      failedCount,
      sentCount,
      items: items.map((n) => {
        const payload =
          n.payload && typeof n.payload === "object"
            ? (n.payload as Record<string, unknown>)
            : {};
        return {
          id: n.id,
          type: n.type,
          channel: n.channel,
          status: n.status,
          templateKey: String(payload.templateKey || n.type),
          recipientRole: String(payload.recipientRole || "patient"),
          to: String(payload.to || ""),
          title: notificationTitle(payload, n.type),
          summary: notificationSummary(payload, n.booking),
          payload,
          sentAt: n.sentAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
          booking: n.booking
            ? {
                id: n.booking.id,
                patientPhone: n.booking.patientPhone,
                patientName: n.booking.patientName,
                status: n.booking.status,
                slotStart: n.booking.slotStart?.toISOString() ?? null,
                sessionDate: n.booking.sessionDate
                  ? n.booking.sessionDate.toISOString().slice(0, 10)
                  : null,
                providerId: n.booking.providerId,
              }
            : null,
        };
      }),
    };
  },

  /** Soft-remove from practice inbox (keeps send audit for admin). */
  async dismissForPractice(
    practiceId: string,
    notificationId: string,
    actorUserId: string,
  ) {
    const { PracticeService } = await import("./practice.service.js");
    await PracticeService.assertMember(practiceId, actorUserId);

    const existing = await prisma.notificationEvent.findFirst({
      where: { id: notificationId, practiceId },
      select: { id: true, dismissedAt: true },
    });
    if (!existing) {
      const { AppError } = await import("../../core/response.js");
      throw new AppError(404, "Notification not found");
    }
    if (existing.dismissedAt) {
      return { id: existing.id, dismissed: true };
    }

    await prisma.notificationEvent.update({
      where: { id: notificationId },
      data: { dismissedAt: new Date() },
    });
    return { id: notificationId, dismissed: true };
  },
};

function clinicInboxKindScope(kind?: string | null): {
  clinicKeys: readonly string[];
  patientKeys: readonly string[];
} {
  const k = String(kind || "")
    .trim()
    .toLowerCase();
  if (!k || k === "all") {
    return {
      clinicKeys: CLINIC_INBOX_TEMPLATE_KEYS,
      patientKeys: PATIENT_OUTBOUND_INBOX_KEYS,
    };
  }
  if (k === "appointments") {
    return {
      clinicKeys: [
        "CLINIC_NEW_BOOKING",
        "CLINIC_CANCEL",
        "CLINIC_RESCHEDULE",
      ],
      patientKeys: [],
    };
  }
  if (k === "messages") {
    return { clinicKeys: ["CLINIC_MESSAGE"], patientKeys: [] };
  }
  if (k === "documents") {
    return { clinicKeys: ["CLINIC_DOCUMENT"], patientKeys: [] };
  }
  if (k === "outbound") {
    return {
      clinicKeys: ["CLINIC_OUTBOUND_MESSAGE"],
      patientKeys: PATIENT_OUTBOUND_INBOX_KEYS,
    };
  }
  return {
    clinicKeys: CLINIC_INBOX_TEMPLATE_KEYS,
    patientKeys: PATIENT_OUTBOUND_INBOX_KEYS,
  };
}

function notificationTitle(
  payload: Record<string, unknown>,
  type: string,
): string {
  const key = String(payload.templateKey || type);
  const map: Record<string, string> = {
    BOOKING_CONFIRMATION: "Message to patient · Booking confirmed",
    CLINIC_NEW_BOOKING: "New appointment",
    CANCELLATION: "Message to patient · Booking cancelled",
    CLINIC_CANCEL: "Booking cancelled",
    REMINDER: "Message to patient · Reminder",
    REMINDER_24H: "Message to patient · Reminder (24h)",
    RESCHEDULE: "Message to patient · Rescheduled",
    CLINIC_RESCHEDULE: "Booking rescheduled",
    QUEUE_ALERT: "Message to patient · Queue update",
    CLINIC_QUEUE_ALERT: "Patient called in",
    CLINIC_WAITING: "Patient arrived / waiting",
    CLINIC_NO_SHOW: "Patient marked no-show",
    CLINIC_COMPLETED: "Visit completed",
    CLINIC_DOCUMENT: "Attachment uploaded",
    CLINIC_OVERRIDE: "Schedule override",
    CLINIC_MODE_CHANGE: "Booking type change",
    CLINIC_SUPPORT: "Support request",
    CLINIC_MESSAGE: "Message from patient",
    CLINIC_OUTBOUND_MESSAGE: "Message to patient",
    VISIT_SUMMARY: "Visit summary sent",
    PRESCRIPTION_UPDATE: "Message to patient · Prescription",
    OVERRIDE_IMPACT: "Message to patient · Schedule change",
  };
  return map[key] || key.replace(/_/g, " ");
}

function notificationSummary(
  payload: Record<string, unknown>,
  booking: {
    patientName: string | null;
    patientPhone: string;
    slotStart: Date | null;
    sessionDate: Date | null;
  } | null,
): string {
  const patient =
    String(payload.patientName || booking?.patientName || "").trim() ||
    String(payload.patientPhone || booking?.patientPhone || "").trim() ||
    "Patient";
  const phone = String(
    payload.patientPhone || booking?.patientPhone || "",
  ).trim();
  const when =
    String(payload.whenLabel || "").trim() ||
    (booking?.slotStart
      ? formatPracticeDateTime(booking.slotStart)
      : booking?.sessionDate
        ? formatLocalDate(booking.sessionDate)
        : "");
  const doctor = String(payload.providerName || "").trim();
  const location = String(payload.location || "").trim();
  const channel = String(payload.channel || "").trim();
  const key = String(payload.templateKey || "");

  const extras: string[] = [];
  if (key === "CLINIC_DOCUMENT") {
    const docName = String(payload.docName || "").trim() || "Document";
    const kind =
      String(payload.docKind || "visit") === "general"
        ? "general"
        : "visit";
    extras.push(`${docName} (${kind})`);
  } else if (
    key === "CLINIC_WAITING" ||
    key === "CLINIC_NO_SHOW" ||
    key === "CLINIC_COMPLETED"
  ) {
    const statusLabel = String(payload.statusLabel || "").trim();
    if (statusLabel) extras.push(statusLabel);
  } else if (key === "CLINIC_SUPPORT") {
    extras.push("Open Support to chat");
  } else if (key === "CLINIC_MESSAGE") {
    const via =
      String(payload.messageChannel || "") === "whatsapp"
        ? "via WhatsApp"
        : "via app";
    const preview = String(payload.messagePreview || "").trim();
    extras.push(via);
    if (preview) extras.push(`“${preview}”`);
  } else if (key === "CLINIC_OUTBOUND_MESSAGE") {
    const via =
      String(payload.messageChannel || "") === "whatsapp"
        ? "via WhatsApp"
        : "via app";
    const preview = String(payload.messagePreview || "").trim();
    extras.push(`sent ${via}`);
    if (preview) extras.push(`“${preview}”`);
  } else if (key === "CLINIC_NEW_BOOKING" || key === "CLINIC_RESCHEDULE") {
    if (channel) extras.push(channel.replace(/_/g, " ").toLowerCase());
  } else if (key === "CLINIC_OVERRIDE") {
    const reason = String(payload.reason || "").trim();
    if (reason) extras.push(reason);
  } else if (key === "CLINIC_MODE_CHANGE") {
    const fromLabel = String(payload.fromLabel || "").trim();
    const toLabel = String(payload.toLabel || "").trim();
    const effectiveDate = String(payload.effectiveDate || "").trim();
    if (fromLabel && toLabel) extras.push(`${fromLabel} → ${toLabel}`);
    if (effectiveDate) extras.push(`applies ${effectiveDate}`);
  }

  const parts = [
    patient,
    phone && phone !== patient ? phone : null,
    doctor ? `Dr ${doctor.replace(/^dr\.?\s*/i, "")}` : null,
    when || null,
    location || null,
    ...extras,
  ].filter(Boolean);
  return parts.join(" · ");
}
