import type { RazorpayPaymentLink } from "../../lib/razorpay.js";
import { endOfLocalDay, formatPracticeDateTime } from "./slotEngine.js";

/** Booking-level prepay state; DECLINED = patient chose "pay at the clinic". */
export type BookingPaymentStatus =
  | "PENDING"
  | "PAID"
  | "EXPIRED"
  | "CANCELLED"
  | "DECLINED";

export type PaymentRequestStatus = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";

export type PaymentKind = "ADVANCE" | "CONSULTATION" | "CUSTOM";

export type PaymentChannel = "WHATSAPP_BOT" | "WEB_PORTAL" | "PROVIDER_APP";

const MIN_LINK_LIFETIME_MS = 30 * 60 * 1000;
const MAX_LINK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Largest single custom request (₹5,00,000) — guards against typo'd amounts. */
export const MAX_CUSTOM_AMOUNT_PAISE = 5_00_000_00;

/** Rupee amount → paise, or null when not a payable amount (< ₹1). */
export function prepayAmountPaise(
  rupees: number | null | undefined,
): number | null {
  const fee = Number(rupees);
  if (!Number.isFinite(fee) || fee < 1) return null;
  return Math.round(fee * 100);
}

/**
 * What the WhatsApp bot asks for before a visit: the clinic's advance booking
 * amount when set, otherwise the full consultation fee.
 */
export function prepayOffer(practice: {
  consultationFee?: number | null;
  advanceBookingAmount?: number | null;
}): { amount: number; kind: "ADVANCE" | "CONSULTATION" } | null {
  const advance = prepayAmountPaise(practice.advanceBookingAmount);
  if (advance != null) return { amount: advance, kind: "ADVANCE" };
  const fee = prepayAmountPaise(practice.consultationFee);
  if (fee != null) return { amount: fee, kind: "CONSULTATION" };
  return null;
}

/** Staff-entered custom amount (rupees, max 2 decimals) → paise. */
export function parseCustomAmountPaise(input: unknown): number | null {
  const raw = typeof input === "string" ? input.replace(/[₹,\s]/g, "") : input;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  const paise = Math.round(n * 100);
  if (Math.abs(paise - n * 100) > 1e-6) return null;
  if (paise > MAX_CUSTOM_AMOUNT_PAISE) return null;
  return paise;
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const text = Number.isInteger(rupees)
    ? rupees.toLocaleString("en-IN")
    : rupees.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  return `₹${text}`;
}

export function kindLabel(kind: string, purpose?: string | null): string {
  if (kind === "ADVANCE") return "Advance booking amount";
  if (kind === "CONSULTATION") return "Consultation fee";
  return purpose?.trim() || "Clinic charges";
}

/** Left to pay at the clinic after a prepay; null when the clinic fee isn't set. */
export function balanceDuePaise(
  kind: string,
  paidPaise: number,
  consultationFee: number | null | undefined,
): number | null {
  if (kind === "CONSULTATION") return 0;
  const fee = prepayAmountPaise(consultationFee);
  if (fee == null) return null;
  return Math.max(0, fee - paidPaise);
}

/** Slot time, or visit date + token for token-queue bookings. */
export function appointmentWhenLabel(b: {
  slotStart: Date | null;
  sessionDate: Date | null;
  tokenNumber: number | null;
}): string | null {
  if (b.slotStart) return formatPracticeDateTime(b.slotStart);
  if (!b.sessionDate) return null;
  const day = b.sessionDate.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
  return b.tokenNumber != null ? `${day} (Token #${b.tokenNumber})` : day;
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
      : new Date(now.getTime() + DAY_MS);
  const min = now.getTime() + MIN_LINK_LIFETIME_MS;
  const max = now.getTime() + MAX_LINK_LIFETIME_MS;
  return new Date(Math.min(max, Math.max(min, target.getTime())));
}

/** Custom requests: 1–30 days, default 7. */
export function customLinkExpiry(
  days: unknown,
  now: Date = new Date(),
): Date {
  const n = Math.round(Number(days));
  const d = Number.isFinite(n) && n >= 1 ? Math.min(30, n) : 7;
  return new Date(now.getTime() + d * DAY_MS);
}

export function statusFromLink(
  link: Pick<RazorpayPaymentLink, "status">,
): PaymentRequestStatus {
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

/** Stored patient phone: full international digits, or the last 10 for local numbers. */
export function normalizePatientPhone(input: unknown): string | null {
  const digits = String(input ?? "").replace(/\D/g, "").replace(/^00/, "");
  const phone =
    digits.length >= 11 && digits.length <= 15 ? digits : digits.slice(-10);
  return phone.length >= 10 ? phone : null;
}

export function e164(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
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
