import type { PracticeBooking } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import {
  practicePaymentsEnabled,
  type PracticeRazorpayFields,
} from "./paymentAccount.service.js";
import { broadcastProctoEvent, serializeBooking } from "./proctoSocket.js";
import {
  kindLabel,
  normalizePatientPhone,
  paymentLinkExpiry,
  prepayOffer,
} from "./paymentHelpers.js";
import { PaymentRequestService } from "./paymentRequest.service.js";

export {
  formatRupees,
  paymentLinkExpiry,
  paymentView,
  prepayAmountPaise,
  prepayOffer,
  statusFromLink,
  type BookingPaymentStatus,
} from "./paymentHelpers.js";

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

type PrepayPractice = PracticeRazorpayFields & {
  consultationFee?: number | null;
  advanceBookingAmount?: number | null;
};

export const BookingPaymentService = {
  /** True when the WhatsApp bot should offer "pay before the appointment". */
  canOfferPrepay(practice: PrepayPractice): boolean {
    return practicePaymentsEnabled(practice) && prepayOffer(practice) != null;
  },

  /**
   * Create (or reuse an open) Razorpay Payment Link for the booking's advance
   * amount / consultation fee. Razorpay itself sends nothing — the bot shares the URL.
   */
  async createLink(bookingId: string) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      include: {
        practice: {
          select: { name: true, consultationFee: true, advanceBookingAmount: true },
        },
      },
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
    const offer = prepayOffer(booking.practice);
    if (!offer) {
      throw new AppError(400, "No consultation fee is set for this clinic.");
    }

    const request = await PaymentRequestService.createLinkRecord({
      practiceId: booking.practiceId,
      practiceName: booking.practice.name,
      providerId: booking.providerId,
      bookingId: booking.id,
      patientId: booking.patientId,
      patientName: booking.patientName,
      patientPhone: normalizePatientPhone(booking.patientPhone) ?? booking.patientPhone,
      kind: offer.kind,
      purpose: kindLabel(offer.kind),
      amount: offer.amount,
      expireAt: paymentLinkExpiry(booking),
      channel: "WHATSAPP_BOT",
    });

    const updated = await prisma.practiceBooking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: "PENDING",
        paymentAmount: offer.amount,
        paymentLinkId: request.linkId,
        paymentLinkUrl: request.linkUrl,
        paymentId: null,
        paidAt: null,
      },
    });
    broadcast(updated);
    return { url: request.linkUrl ?? "", amount: offer.amount, reused: false };
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

  /** Ask Razorpay for the latest state of the booking's prepay link. */
  async refresh(bookingId: string) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new AppError(404, "booking not found.");
    if (booking.paymentStatus === "PENDING" && booking.paymentLinkId) {
      await PaymentRequestService.refreshByLinkId(booking.paymentLinkId);
    }
    return prisma.practiceBooking.findUniqueOrThrow({ where: { id: bookingId } });
  },
};
