import { NotificationType } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { formatPracticeDateTime, formatLocalDate } from "./slotEngine.js";
import { enqueueNotificationEvent } from "../../workers/notificationQueue.js";

export type NotifyOpts = {
  /** Bot already sent a short in-session ack — skip duplicate patient UTILITY template. */
  skipPatientTemplate?: boolean;
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

/** Prefer practice phone, then owner/doctor user phone. */
export async function resolveClinicNotifyPhone(practiceId: string): Promise<string | null> {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { phone: true },
  });
  if (practice?.phone?.trim()) return practice.phone.replace(/\D/g, "").slice(-10);

  const owner = await prisma.practiceMember.findFirst({
    where: {
      practiceId,
      isActive: true,
      role: { in: ["PRACTICE_OWNER", "DOCTOR"] },
    },
    include: { user: { select: { phone: true } } },
    orderBy: { role: "asc" },
  });
  const phone = owner?.user?.phone?.replace(/\D/g, "").slice(-10);
  return phone || null;
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
    return event;
  } catch (error) {
    console.warn("notification enqueue skipped:", error);
    return null;
  }
}

/**
 * Always write a clinic inbox row. WhatsApp send is optional — if there is no
 * clinic phone, the worker marks the event SKIPPED (in-app only) so status /
 * docs / support still appear on Notifications.
 */
async function enqueueClinicInbox(data: {
  practiceId: string;
  bookingId: string;
  type: NotificationType;
  templateKey: string;
  payload: Record<string, unknown>;
}) {
  const clinicTo = await resolveClinicNotifyPhone(data.practiceId);
  return createAndEnqueue({
    practiceId: data.practiceId,
    bookingId: data.bookingId,
    type: data.type,
    payload: {
      ...data.payload,
      to: clinicTo || "",
      templateKey: data.templateKey,
      recipientRole: "clinic",
      inAppOnly: !clinicTo,
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

    await enqueueClinicInbox({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.CANCELLATION,
      templateKey: "CLINIC_CANCEL",
      payload: { ...base },
    });

    return true;
  },

  async enqueueReminder(bookingId: string) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const { getPracticeEntitlement, hasFeatureFlag } = await import(
      "./planEntitlements.js"
    );
    const ent = await getPracticeEntitlement(booking.practiceId);
    if (!ent.usable || !hasFeatureFlag(ent.features, "reminders")) {
      return null;
    }

    return createAndEnqueue({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.REMINDER,
      payload: {
        to: booking.patientPhone,
        templateKey: "REMINDER",
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

    await enqueueClinicInbox({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.RESCHEDULE,
      templateKey: "CLINIC_RESCHEDULE",
      payload: { ...base },
    });

    return true;
  },

  async enqueueOverrideImpact(
    bookingId: string,
    reason?: string,
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
   * Clinic inbox (+ WA text) for status changes that lack a dedicated CLINIC_* Meta template.
   * Covers WAITING / NO_SHOW / COMPLETED so every queue change reaches the doctor.
   */
  async enqueueClinicStatusChange(
    bookingId: string,
    status: "WAITING" | "NO_SHOW" | "COMPLETED",
  ) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    const templateKey =
      status === "WAITING"
        ? "CLINIC_WAITING"
        : status === "NO_SHOW"
          ? "CLINIC_NO_SHOW"
          : "CLINIC_COMPLETED";

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
          status === "WAITING"
            ? "arrived / waiting"
            : status === "NO_SHOW"
              ? "no-show"
              : "completed",
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
   * Practice inbox: undismissed WhatsApp notification events for this clinic
   * (patient + clinic recipients). Membership required.
   */
  async listForPractice(
    practiceId: string,
    actorUserId: string,
    opts?: { status?: string; take?: number; skip?: number },
  ) {
    const { PracticeService } = await import("./practice.service.js");
    await PracticeService.assertMember(practiceId, actorUserId);

    const take = Math.min(opts?.take ?? 50, 100);
    const skip = opts?.skip ?? 0;
    const statusFilter =
      opts?.status && opts.status !== "ALL" ? opts.status.trim() : undefined;

    const where = {
      practiceId,
      dismissedAt: null,
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    // One groupBy for badge counts instead of 3 separate count queries.
    const [items, total, statusGroups] = await Promise.all([
      prisma.notificationEvent.findMany({
        where,
        take,
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
        where: { practiceId, dismissedAt: null },
        _count: { _all: true },
      }),
    ]);

    let pendingCount = 0;
    let failedCount = 0;
    let sentCount = 0;
    for (const row of statusGroups) {
      const n = row._count._all;
      if (row.status === "PENDING") pendingCount = n;
      else if (row.status === "FAILED") failedCount = n;
      else if (row.status === "SENT") sentCount = n;
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

function notificationTitle(
  payload: Record<string, unknown>,
  type: string,
): string {
  const key = String(payload.templateKey || type);
  const map: Record<string, string> = {
    BOOKING_CONFIRMATION: "Booking confirmed (patient)",
    CLINIC_NEW_BOOKING: "New booking (clinic alert)",
    CANCELLATION: "Booking cancelled (patient)",
    CLINIC_CANCEL: "Booking cancelled (clinic alert)",
    REMINDER: "Appointment reminder",
    RESCHEDULE: "Booking rescheduled (patient)",
    CLINIC_RESCHEDULE: "Booking rescheduled (clinic alert)",
    QUEUE_ALERT: "Queue alert (patient)",
    CLINIC_QUEUE_ALERT: "Queue alert (clinic)",
    CLINIC_WAITING: "Patient arrived / waiting",
    CLINIC_NO_SHOW: "Patient marked no-show",
    CLINIC_COMPLETED: "Visit completed",
    CLINIC_DOCUMENT: "Patient document shared",
    CLINIC_OVERRIDE: "Schedule override (clinic alert)",
    CLINIC_SUPPORT: "Support request",
    VISIT_SUMMARY: "Visit summary sent",
    PRESCRIPTION_UPDATE: "Prescription update sent",
    OVERRIDE_IMPACT: "Schedule change notice",
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
  const when =
    String(payload.whenLabel || "").trim() ||
    (booking?.slotStart
      ? formatPracticeDateTime(booking.slotStart)
      : booking?.sessionDate
        ? formatLocalDate(booking.sessionDate)
        : "");
  const role = String(payload.recipientRole || "patient");
  const key = String(payload.templateKey || "");
  const extra =
    key === "CLINIC_DOCUMENT"
      ? String(payload.docName || "").trim() || null
      : key === "CLINIC_WAITING" ||
          key === "CLINIC_NO_SHOW" ||
          key === "CLINIC_COMPLETED"
        ? String(payload.statusLabel || "").trim() || null
        : key === "CLINIC_SUPPORT"
          ? "Open Support to chat"
          : null;
  const parts = [
    role === "clinic" ? "To clinic" : `To ${patient}`,
    when ? when : null,
    extra,
  ].filter(Boolean);
  return parts.join(" · ");
}
