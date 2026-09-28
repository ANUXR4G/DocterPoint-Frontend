/**
 * Patient alerts for visits changed by a schedule change.
 *
 * Resolving clashes moves / reassigns / cancels visits straight away, but the
 * patient alert is held until the clashes are settled — every clash resolved,
 * the change activated or discarded, or staff press "Send now" — so each
 * patient hears once, with the final outcome. A sweep sends anything still held
 * when the visit gets close or the alert has waited too long.
 */
import { BookingStatus, ScheduleMode, type Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { settings } from "../../config/index.js";
import { sendEmail } from "../mail.js";
import { NotificationService } from "./notification.service.js";
import { formatPracticeDateTime, parseLocalDate } from "./slotEngine.js";
import {
  ACTIVE_BOOKING_STATUSES,
  localDayOfSessionDate,
  noticeEndsAt,
} from "./scheduleVersions.js";

export type ScheduleAlertKind = "RESCHEDULED" | "REASSIGNED" | "CANCELLED" | "ASK_TO_RESCHEDULE";
export type AlertChannelStatus = "queued" | "held" | "off" | "no_email" | "not_configured" | "n/a";

const PROVISIONAL_EMAIL = "@patients.glucoguide.local";
/** Held alerts go out at the latest this long before the notice window reaches the visit. */
const SWEEP_LEAD_MS = 24 * 60 * 60 * 1000;
const MAX_HOLD_MS = 24 * 60 * 60 * 1000;
const DISPATCH_BATCH = 500;

export function realPatientEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e.includes("@") && !e.endsWith(PROVISIONAL_EMAIL) ? e : null;
}

export function emailConfigured(): boolean {
  return Boolean(settings.smtpPassword);
}

type VisitShape = {
  mode: ScheduleMode;
  slotStart: Date | null;
  sessionDate: Date | null;
  tokenNumber: number | null;
};

function visitStart(b: VisitShape): Date | null {
  if (b.slotStart) return b.slotStart;
  return b.sessionDate ? parseLocalDate(localDayOfSessionDate(b.sessionDate)) : null;
}

function visitWhen(b: VisitShape): string {
  if (b.mode === ScheduleMode.TOKEN_BASED) {
    const day = b.sessionDate ? localDayOfSessionDate(b.sessionDate) : "?";
    return `Token #${b.tokenNumber ?? "?"} on ${day}`;
  }
  return b.slotStart ? formatPracticeDateTime(b.slotStart) : "your scheduled time";
}

/** Held alert is due: close to the visit (notice window + a day) or waiting over a day. */
export function alertIsDue(
  alert: { createdAt: Date },
  visit: Date | null,
  noticeHours: number,
  now: Date = new Date(),
): boolean {
  if (now.getTime() - alert.createdAt.getTime() >= MAX_HOLD_MS) return true;
  if (!visit) return true;
  return visit.getTime() < noticeEndsAt(noticeHours, now).getTime() + SWEEP_LEAD_MS;
}

function emailFor(
  kind: ScheduleAlertKind,
  v: { who: string; practice: string; doctor: string | null; oldWhen: string; newWhen: string; reason: string | null },
): { subject: string; body: string } {
  const withDoctor = v.doctor ? ` with ${v.doctor}` : "";
  const sign = `\n\n${v.practice}`;
  switch (kind) {
    case "RESCHEDULED":
    case "REASSIGNED":
      return {
        subject:
          kind === "REASSIGNED"
            ? `Your doctor has changed — ${v.practice}`
            : `Appointment rescheduled — ${v.practice}`,
        body:
          `Hello ${v.who},\n\nThe doctor's schedule at ${v.practice} has changed, so your appointment was updated.\n\n` +
          `Previous: ${v.oldWhen}\nNew: ${v.newWhen}${withDoctor}\n\n` +
          `If this doesn't suit you, reply RESCHEDULE to our WhatsApp message or call the clinic.${sign}`,
      };
    case "CANCELLED":
      return {
        subject: `Appointment cancelled — ${v.practice}`,
        body:
          `Hello ${v.who},\n\nYour appointment at ${v.practice} on ${v.oldWhen} has been cancelled.\n` +
          `${v.reason ? `Reason: ${v.reason}\n` : ""}\nWe're sorry for the inconvenience. ` +
          `Please book a new time on WhatsApp or call the clinic.${sign}`,
      };
    case "ASK_TO_RESCHEDULE":
      return {
        subject: `Please choose a new appointment time — ${v.practice}`,
        body:
          `Hello ${v.who},\n\nThe doctor's schedule at ${v.practice} has changed and your appointment on ${v.oldWhen}${withDoctor} is affected.\n\n` +
          `Please reply RESCHEDULE on WhatsApp to pick a new time, or CANCEL to cancel — or call the clinic.${sign}`,
      };
  }
}

export type DispatchResult = {
  sent: number;
  skipped: number;
  byKind: Partial<Record<ScheduleAlertKind, number>>;
  sentBookingIds: string[];
};

export const ScheduleAlertService = {
  /** Hold one alert per visit; a newer decision replaces an unsent one. */
  async hold(data: {
    practiceId: string;
    providerId: string;
    bookingId: string;
    kind: ScheduleAlertKind;
    notifyWhatsApp: boolean;
    notifyEmail: boolean;
    oldWhen: string;
    reason?: string | null;
    createdById?: string | null;
  }) {
    await prisma.scheduleChangeAlert.updateMany({
      where: { bookingId: data.bookingId, status: "HELD" },
      data: { status: "SKIPPED", outcome: { replaced: true } },
    });
    return prisma.scheduleChangeAlert.create({
      data: {
        practiceId: data.practiceId,
        providerId: data.providerId,
        bookingId: data.bookingId,
        kind: data.kind,
        notifyWhatsApp: data.notifyWhatsApp,
        notifyEmail: data.notifyEmail,
        oldWhen: data.oldWhen.slice(0, 160),
        reason: data.reason?.slice(0, 250) ?? null,
        createdById: data.createdById ?? null,
      },
    });
  },

  /** Visits left outside the schedule on activation: ask the patient to pick a new time. */
  async holdAskToReschedule(
    practiceId: string,
    providerId: string,
    visits: Array<{ bookingId: string; oldWhen: string }>,
    createdById: string,
  ): Promise<number> {
    for (const v of visits) {
      await this.hold({
        practiceId,
        providerId,
        bookingId: v.bookingId,
        kind: "ASK_TO_RESCHEDULE",
        notifyWhatsApp: true,
        notifyEmail: true,
        oldWhen: v.oldWhen,
        createdById,
      });
    }
    return visits.length;
  },

  countHeld(practiceId: string, providerId: string) {
    return prisma.scheduleChangeAlert.count({ where: { practiceId, providerId, status: "HELD" } });
  },

  /**
   * Send held alerts (all for a doctor's schedule change, or `ids`). Each alert
   * is claimed before sending so a concurrent sweep can't send it twice; an
   * alert whose visit no longer matches (e.g. patient cancelled) is skipped.
   */
  async dispatch(where: { practiceId?: string; providerId?: string; ids?: string[] }): Promise<DispatchResult> {
    const result: DispatchResult = { sent: 0, skipped: 0, byKind: {}, sentBookingIds: [] };
    if (where.ids && !where.ids.length) return result;
    const filter: Prisma.ScheduleChangeAlertWhereInput = {
      status: "HELD",
      ...(where.practiceId ? { practiceId: where.practiceId } : {}),
      ...(where.providerId ? { providerId: where.providerId } : {}),
      ...(where.ids ? { id: { in: where.ids } } : {}),
    };
    const alerts = await prisma.scheduleChangeAlert.findMany({
      where: filter,
      orderBy: { createdAt: "asc" },
      take: DISPATCH_BATCH,
      include: { booking: { include: { practice: { select: { name: true } } } } },
    });
    if (!alerts.length) return result;

    const people = [...new Set(alerts.flatMap((a) => [a.booking.providerId, a.booking.patientId]).filter(Boolean))] as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: people } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    const now = new Date();

    for (const alert of alerts) {
      const claimed = await prisma.scheduleChangeAlert.updateMany({
        where: { id: alert.id, status: "HELD" },
        data: { status: "SENT", sentAt: now },
      });
      if (!claimed.count) continue;
      const kind = alert.kind as ScheduleAlertKind;
      const b = alert.booking;
      const start = visitStart(b);
      const stillValid =
        (kind === "CANCELLED"
          ? b.status === BookingStatus.CANCELED
          : (ACTIVE_BOOKING_STATUSES as BookingStatus[]).includes(b.status)) &&
        (!start || start.getTime() > now.getTime());
      if (!stillValid) {
        await prisma.scheduleChangeAlert.update({
          where: { id: alert.id },
          data: { status: "SKIPPED", outcome: { skipped: "visit changed or passed" } },
        });
        result.skipped++;
        continue;
      }

      let whatsapp: AlertChannelStatus = "off";
      let email: AlertChannelStatus = "off";
      try {
        if (alert.notifyWhatsApp) {
          if (kind === "CANCELLED") {
            await NotificationService.enqueueCancellation(b.id, { skipClinicInbox: true });
          } else if (kind === "ASK_TO_RESCHEDULE") {
            await NotificationService.enqueueOverrideImpact(b.id, "doctor's schedule changed");
          } else {
            await NotificationService.enqueueReschedule(b.id, alert.oldWhen, { skipClinicInbox: true });
          }
          whatsapp = "queued";
        }
        if (alert.notifyEmail) {
          const to = b.patientId ? realPatientEmail(userById.get(b.patientId)?.email) : null;
          if (!emailConfigured()) email = "not_configured";
          else if (!to) email = "no_email";
          else {
            const doctor = userById.get(b.providerId)?.name ?? null;
            const msg = emailFor(kind, {
              who: b.patientName || "Patient",
              practice: b.practice.name,
              doctor,
              oldWhen: alert.oldWhen,
              newWhen: visitWhen(b),
              reason: alert.reason,
            });
            void sendEmail(to, msg.subject, msg.body).catch((err) =>
              console.warn("[schedule-alert] email failed:", String(err)),
            );
            email = "queued";
          }
        }
        await prisma.scheduleChangeAlert.update({
          where: { id: alert.id },
          data: { outcome: { whatsapp, email } },
        });
        result.sent++;
        result.byKind[kind] = (result.byKind[kind] ?? 0) + 1;
        result.sentBookingIds.push(b.id);
      } catch (err) {
        console.warn("[schedule-alert] send failed:", alert.id, String(err));
        await prisma.scheduleChangeAlert
          .update({ where: { id: alert.id }, data: { outcome: { whatsapp, email, error: "send failed" } } })
          .catch(() => undefined);
      }
    }
    console.log(
      `[schedule-alert] sent=${result.sent} skipped=${result.skipped}` +
        (where.providerId ? ` provider=${where.providerId}` : " sweep"),
    );
    return result;
  },

  /** Send held alerts that are due (visit getting close, or held over a day). */
  async dispatchDue(scope: { practiceId?: string; providerId?: string } = {}, now = new Date()) {
    const held = await prisma.scheduleChangeAlert.findMany({
      where: {
        status: "HELD",
        ...(scope.practiceId ? { practiceId: scope.practiceId } : {}),
        ...(scope.providerId ? { providerId: scope.providerId } : {}),
      },
      take: DISPATCH_BATCH,
      select: {
        id: true,
        createdAt: true,
        booking: {
          select: {
            mode: true,
            slotStart: true,
            sessionDate: true,
            tokenNumber: true,
            practice: { select: { scheduleNoticeHours: true } },
          },
        },
      },
    });
    const due = held.filter((a) =>
      alertIsDue(a, visitStart(a.booking), a.booking.practice.scheduleNoticeHours, now),
    );
    if (!due.length) return { sent: 0, skipped: 0, byKind: {}, sentBookingIds: [] } as DispatchResult;
    return this.dispatch({ ids: due.map((a) => a.id) });
  },
};