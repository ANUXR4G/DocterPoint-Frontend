import { NotificationType } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
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
        ? `Token #${booking.tokenNumber ?? "?"} on ${booking.sessionDate?.toISOString().slice(0, 10) ?? "?"}`
        : booking.slotStart
          ? booking.slotStart.toLocaleString()
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

    const clinicTo = await resolveClinicNotifyPhone(booking.practiceId);
    if (clinicTo) {
      await createAndEnqueue({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.BOOKING_CONFIRMATION,
        payload: {
          to: clinicTo,
          templateKey: "CLINIC_NEW_BOOKING",
          recipientRole: "clinic",
          ...base,
        },
      });
    }

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

    const clinicTo = await resolveClinicNotifyPhone(booking.practiceId);
    if (clinicTo) {
      await createAndEnqueue({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.CANCELLATION,
        payload: {
          to: clinicTo,
          templateKey: "CLINIC_CANCEL",
          recipientRole: "clinic",
          ...base,
        },
      });
    }

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

    const clinicTo = await resolveClinicNotifyPhone(booking.practiceId);
    if (clinicTo) {
      await createAndEnqueue({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.RESCHEDULE,
        payload: {
          to: clinicTo,
          templateKey: "CLINIC_RESCHEDULE",
          recipientRole: "clinic",
          ...base,
        },
      });
    }

    return true;
  },

  async enqueueOverrideImpact(
    bookingId: string,
    reason?: string,
  ) {
    const booking = await loadBooking(bookingId);
    if (!booking) return null;

    return createAndEnqueue({
      practiceId: booking.practiceId,
      bookingId: booking.id,
      type: NotificationType.RESCHEDULE,
      payload: {
        to: booking.patientPhone,
        templateKey: "OVERRIDE_IMPACT",
        recipientRole: "patient",
        practiceName: booking.practice.name,
        reason: reason ?? "",
        ...whenFields(booking),
      },
    });
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

    const clinicTo = await resolveClinicNotifyPhone(booking.practiceId);
    if (clinicTo) {
      await createAndEnqueue({
        practiceId: booking.practiceId,
        bookingId: booking.id,
        type: NotificationType.QUEUE_ALERT,
        payload: {
          to: clinicTo,
          templateKey: "CLINIC_QUEUE_ALERT",
          recipientRole: "clinic",
          ...base,
        },
      });
    }

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
};
