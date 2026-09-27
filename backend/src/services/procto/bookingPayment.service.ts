import type { PracticeBooking } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { razorpay, type RazorpayPaymentLink } from "../../lib/razorpay.js";
import { publicApiOrigin } from "./bookingCalendar.js";
import { broadcastProctoEvent, serializeBooking } from "./proctoSocket.js";
import { endOfLocalDay, formatPracticeDateTime } from "./slotEngine.js";
import { sendWhatsAppText } from "./whatsapp.client.js";

export type BookingPaymentStatus =
  | "PENDING"
  | "PAID"
  | "EXPIRED"
  | "CANCELLED"
  | "DECLINED";

const MIN_LINK_LIFETIME_MS = 30 * 60 * 1000;
const MAX_LINK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Consultation fee in paise, or null when the clinic has no payable fee. */
export function prepayAmountPaise(
  consultationFee: number | null | undefined,
): number | null {
  const fee = Number(consultationFee);
  if (!Number.isFinite(fee) || fee < 1) return null;
  return Math.round(fee * 100);
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

/** Link lives until the visit starts (end of day for token visits), min 30 min, max 30 days. */
export function paymentLinkExpiry(
  booking: { slotStart: Date | null; sessionDate: Date | null },
  now: Date = new Date(),
): Date {
  const target = booking.slotStart
    ? booking.slotStart
    : booking.sessionDate
      ? endOfLocalDay(booking.sessionDate)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const min = now.getTime() + MIN_LINK_LIFETIME_MS;
  const max = now.getTime() + MAX_LINK_LIFETIME_MS;
  return new Date(Math.min(max, Math.max(min, target.getTime())));
}

export function statusFromLink(
  link: Pick<RazorpayPaymentLink, "status">,
): BookingPaymentStatus {
  switch (link.status) {
    case "paid":
      return "PAID";
    case "expired":
      return "EXPIRED";
    case "cancelled":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

function e164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

async function practicePhoneNumberId(
  practiceId: string,
): Promise<string | undefined> {
  const row = await prisma.whatsAppNumber.findFirst({
    where: {
      practiceId,
      status: { in: ["LIVE", "TEMPLATES_PENDING", "DISPLAY_NAME_PENDING"] },
    },
    select: { wabaPhoneNumberId: true },
  });
  return row?.wabaPhoneNumberId ?? undefined;
}

function broadcast(booking: PracticeBooking) {
  void broadcastProctoEvent(
    booking.practiceId,
    { event: "booking_updated", booking: serializeBooking(booking) },
    booking.patientId,
  ).catch(() => undefined);
  void import("../opsSocket.js")
    .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
    .catch(() => undefined);
}

export function paymentView(b: {
  paymentStatus: string | null;
  paymentAmount: number | null;
  paymentLinkUrl: string | null;
  paymentId: string | null;
  paidAt: Date | null;
}) {
  return {
    status: (b.paymentStatus as BookingPaymentStatus | null) ?? null,
    amount: b.paymentAmount,
    linkUrl: b.paymentStatus === "PENDING" ? b.paymentLinkUrl : null,
    paymentId: b.paymentId,
    paidAt: b.paidAt,
  };
}

export const BookingPaymentService = {
  /** True when the WhatsApp bot should offer "pay before the appointment". */
  canOfferPrepay(consultationFee: number | null | undefined): boolean {
    return razorpay.isConfigured() && prepayAmountPaise(consultationFee) != null;
  },

  /**
   * Create (or reuse an open) Razorpay Payment Link for the booking's
   * consultation fee. Razorpay itself sends nothing — the bot shares the URL.
   */
  async createLink(bookingId: string) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      include: { practice: { select: { name: true, consultationFee: true } } },
    });
    if (!booking) throw new AppError(404, "booking not found.");
    if (booking.paymentStatus === "PAID") {
      throw new AppError(400, "This appointment is already paid.");
    }
    if (booking.paymentStatus === "PENDING" && booking.paymentLinkUrl) {
      return {
        url: booking.paymentLinkUrl,
        amount: booking.paymentAmount ?? 0,
        reused: true,
      };
    }
    const amount = prepayAmountPaise(booking.practice.consultationFee);
    if (amount == null) {
      throw new AppError(400, "No consultation fee is set for this clinic.");
    }

    const expireAt = paymentLinkExpiry(booking);
    const link = await razorpay.createPaymentLink({
      amount,
      description: `Consultation fee · ${booking.practice.name}`.slice(0, 250),
      reference_id: `bk-${booking.id.slice(0, 8)}-${Date.now().toString(36)}`,
      expire_by: Math.floor(expireAt.getTime() / 1000),
      customer: {
        name: booking.patientName?.trim() || undefined,
        contact: e164(booking.patientPhone),
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      callback_url: `${publicApiOrigin()}/api/v1/procto/payments/razorpay/callback`,
      callback_method: "get",
      notes: { booking_id: booking.id, practice_id: booking.practiceId },
    });

    const updated = await prisma.practiceBooking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: "PENDING",
        paymentAmount: amount,
        paymentLinkId: link.id,
        paymentLinkUrl: link.short_url,
        paymentId: null,
        paidAt: null,
      },
    });
    broadcast(updated);
    console.log(
      `[payment] link ${link.id} booking=${booking.id} amount=${amount}`,
    );
    return { url: link.short_url, amount, reused: false };
  },

  /** Patient chose "pay at the clinic" on WhatsApp. */
  async markDeclined(bookingId: string) {
    const res = await prisma.practiceBooking.updateMany({
      where: { id: bookingId, paymentStatus: null },
      data: { paymentStatus: "DECLINED" },
    });
    if (res.count) {
      const b = await prisma.practiceBooking.findUnique({ where: { id: bookingId } });
      if (b) broadcast(b);
    }
  },

  /** Apply a Razorpay link state to the booking; notifies the patient once on PAID. */
  async applyLinkState(
    paymentLinkId: string,
    next: BookingPaymentStatus,
    paymentId?: string | null,
  ) {
    const booking = await prisma.practiceBooking.findFirst({
      where: { paymentLinkId },
      include: { practice: { select: { name: true } } },
    });
    if (!booking) return null;
    if (booking.paymentStatus === "PAID" || booking.paymentStatus === next) {
      return booking;
    }

    if (next === "PAID") {
      const res = await prisma.practiceBooking.updateMany({
        where: { id: booking.id, paymentStatus: { not: "PAID" } },
        data: {
          paymentStatus: "PAID",
          paymentId: paymentId ?? null,
          paidAt: new Date(),
        },
      });
      const updated = await prisma.practiceBooking.findUnique({
        where: { id: booking.id },
      });
      if (!updated) return null;
      broadcast(updated);
      if (res.count) {
        const when = updated.slotStart
          ? formatPracticeDateTime(updated.slotStart)
          : updated.tokenNumber != null
            ? `Token #${updated.tokenNumber}`
            : "your appointment";
        const body =
          `✅ Payment received — ${formatRupees(updated.paymentAmount ?? 0)} for your appointment at *${booking.practice.name}* (${when}).` +
          (paymentId ? `\nPayment ID: ${paymentId}` : "") +
          `\n\nSee you at the clinic.`;
        void practicePhoneNumberId(updated.practiceId)
          .then((phoneId) => sendWhatsAppText(updated.patientPhone, body, phoneId))
          .catch(() => undefined);
        console.log(`[payment] PAID booking=${updated.id} payment=${paymentId ?? "-"}`);
      }
      return updated;
    }

    const updated = await prisma.practiceBooking.update({
      where: { id: booking.id },
      data: { paymentStatus: next },
    });
    broadcast(updated);
    return updated;
  },

  /** Ask Razorpay for the latest link state (used when no webhook arrived). */
  async refresh(bookingId: string) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new AppError(404, "booking not found.");
    if (
      booking.paymentStatus !== "PENDING" ||
      !booking.paymentLinkId ||
      !razorpay.isConfigured()
    ) {
      return booking;
    }
    const link = await razorpay.getPaymentLink(booking.paymentLinkId);
    const next = statusFromLink(link);
    if (next === "PENDING") return booking;
    const paid = link.payments?.find((p) => p.status === "captured") ?? link.payments?.[0];
    return (
      (await this.applyLinkState(link.id, next, paid?.payment_id)) ?? booking
    );
  },

  /** Razorpay redirect after payment — signature-verified. */
  async handleCallback(query: Record<string, unknown>) {
    const paymentLinkId = String(query.razorpay_payment_link_id ?? "");
    const referenceId = String(query.razorpay_payment_link_reference_id ?? "");
    const status = String(query.razorpay_payment_link_status ?? "");
    const paymentId = String(query.razorpay_payment_id ?? "");
    const signature = query.razorpay_signature
      ? String(query.razorpay_signature)
      : undefined;
    if (
      !paymentLinkId ||
      !razorpay.verifyPaymentLinkSignature({
        paymentLinkId,
        referenceId,
        status,
        paymentId,
        signature,
      })
    ) {
      return { ok: false as const };
    }
    const booking = await this.applyLinkState(
      paymentLinkId,
      statusFromLink({ status: status as RazorpayPaymentLink["status"] }),
      paymentId || null,
    );
    return { ok: true as const, paid: status === "paid", booking };
  },

  /** `payment_link.*` events on the shared Razorpay webhook. */
  async handleWebhookEvent(body: {
    event?: string;
    payload?: {
      payment_link?: { entity?: RazorpayPaymentLink };
      payment?: { entity?: { id?: string } };
    };
  }) {
    const link = body.payload?.payment_link?.entity;
    if (!link?.id) return { handled: false };
    const next = statusFromLink(link);
    if (next === "PENDING") return { handled: false };
    await this.applyLinkState(
      link.id,
      next,
      body.payload?.payment?.entity?.id ?? null,
    );
    return { handled: true, status: next };
  },
};
