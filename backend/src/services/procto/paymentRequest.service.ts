import { randomBytes } from "crypto";
import type { PaymentRequest, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { razorpay, type RazorpayPaymentLink } from "../../lib/razorpay.js";
import { publicApiOrigin } from "./bookingCalendar.js";
import { PracticeService } from "./practice.service.js";
import { broadcastProctoEvent, serializeBooking } from "./proctoSocket.js";
import { formatPracticeDateTime } from "./slotEngine.js";
import { sendNotificationWhatsApp } from "./whatsapp.client.js";
import {
  customLinkExpiry,
  e164,
  formatRupees,
  kindLabel,
  normalizePatientPhone,
  parseCustomAmountPaise,
  statusFromLink,
  type PaymentChannel,
  type PaymentKind,
  type PaymentRequestStatus,
} from "./paymentHelpers.js";

/** Grace after `expiresAt` before a still-pending row is shown as expired. */
const EXPIRY_GRACE_MS = 2 * 60 * 1000;

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

function isPrepay(req: Pick<PaymentRequest, "bookingId" | "kind">): boolean {
  return Boolean(req.bookingId) && req.kind !== "CUSTOM";
}

export function paymentRequestView(
  r: PaymentRequest,
  names: Map<string, string | null> = new Map(),
) {
  return {
    id: r.id,
    kind: r.kind as PaymentKind,
    label: kindLabel(r.kind, r.purpose),
    purpose: r.purpose,
    amount: r.amount,
    status: r.status as PaymentRequestStatus,
    linkUrl: r.status === "PENDING" ? r.linkUrl : null,
    paymentId: r.paymentId,
    paidAt: r.paidAt,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    patientName: r.patientName,
    patientPhone: r.patientPhone,
    patientId: r.patientId,
    bookingId: r.bookingId,
    providerId: r.providerId,
    providerName: r.providerId ? (names.get(r.providerId) ?? null) : null,
    requestedByName: r.requestedById
      ? (names.get(r.requestedById) ?? null)
      : null,
    channel: r.channel as PaymentChannel,
    waDelivery: r.waDelivery,
    waError: r.waError,
  };
}

async function userNames(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string | null>();
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((u) => [u.id, u.name]));
}

async function broadcastPayment(r: PaymentRequest) {
  const names = await userNames([r.providerId, r.requestedById]).catch(
    () => new Map<string, string | null>(),
  );
  void broadcastProctoEvent(r.practiceId, {
    event: "payment_updated",
    payment: paymentRequestView(r, names) as unknown as Record<string, unknown>,
  }).catch(() => undefined);
}

/** Mirror a prepay link's state onto its booking (only while the booking still points at this link). */
async function syncBooking(
  req: PaymentRequest,
  data: Prisma.PracticeBookingUpdateManyMutationInput,
) {
  if (!isPrepay(req) || !req.bookingId || !req.linkId) return;
  const res = await prisma.practiceBooking.updateMany({
    where: { id: req.bookingId, paymentLinkId: req.linkId },
    data,
  });
  if (!res.count) return;
  const booking = await prisma.practiceBooking.findUnique({
    where: { id: req.bookingId },
  });
  if (!booking) return;
  void broadcastProctoEvent(
    booking.practiceId,
    { event: "booking_updated", booking: serializeBooking(booking) },
    booking.patientId,
  ).catch(() => undefined);
  void import("../opsSocket.js")
    .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
    .catch(() => undefined);
}

async function receiptPurpose(req: PaymentRequest): Promise<string> {
  const label = kindLabel(req.kind, req.purpose);
  if (!req.bookingId) return label;
  const booking = await prisma.practiceBooking.findUnique({
    where: { id: req.bookingId },
    select: { slotStart: true, tokenNumber: true },
  });
  if (booking?.slotStart) {
    return `${label} · ${formatPracticeDateTime(booking.slotStart)}`;
  }
  if (booking?.tokenNumber != null) {
    return `${label} · Token #${booking.tokenNumber}`;
  }
  return label;
}

async function sendRequestMessage(req: PaymentRequest, practiceName: string) {
  if (!req.linkUrl) return { ok: false, error: "no link" } as const;
  const phoneId = await practicePhoneNumberId(req.practiceId);
  const res = await sendNotificationWhatsApp(
    req.patientPhone,
    "PAYMENT_REQUEST",
    {
      practiceName,
      amountLabel: formatRupees(req.amount),
      purpose: kindLabel(req.kind, req.purpose),
      payLink: req.linkUrl,
      validUntil: req.expiresAt
        ? formatPracticeDateTime(req.expiresAt)
        : undefined,
    },
    phoneId,
  );
  const waDelivery = res.simulated ? "SIMULATED" : res.ok ? "SENT" : "FAILED";
  const updated = await prisma.paymentRequest.update({
    where: { id: req.id },
    data: { waDelivery, waError: res.ok ? null : (res.error ?? "send failed").slice(0, 500) },
  });
  if (!res.ok) {
    console.warn(`[payment] WhatsApp request ${req.id} failed: ${res.error}`);
  }
  return { ok: res.ok, updated } as const;
}

export const PaymentRequestService = {
  /** Create the Razorpay Payment Link and its `payment_requests` row. */
  async createLinkRecord(input: {
    practiceId: string;
    practiceName: string;
    providerId?: string | null;
    bookingId?: string | null;
    patientId?: string | null;
    patientName?: string | null;
    patientPhone: string;
    kind: PaymentKind;
    purpose?: string | null;
    amount: number;
    expireAt: Date;
    channel: PaymentChannel;
    requestedById?: string | null;
  }): Promise<PaymentRequest> {
    const label = kindLabel(input.kind, input.purpose);
    const link = await razorpay.createPaymentLink({
      amount: input.amount,
      description: `${label} · ${input.practiceName}`.slice(0, 250),
      reference_id: `pr-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
      expire_by: Math.floor(input.expireAt.getTime() / 1000),
      customer: {
        name: input.patientName?.trim() || undefined,
        contact: e164(input.patientPhone),
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      callback_url: `${publicApiOrigin()}/api/v1/procto/payments/razorpay/callback`,
      callback_method: "get",
      notes: {
        practice_id: input.practiceId,
        kind: input.kind,
        ...(input.bookingId ? { booking_id: input.bookingId } : {}),
      },
    });
    const row = await prisma.paymentRequest.create({
      data: {
        practiceId: input.practiceId,
        providerId: input.providerId ?? null,
        bookingId: input.bookingId ?? null,
        patientId: input.patientId ?? null,
        patientName: input.patientName?.trim() || null,
        patientPhone: input.patientPhone.slice(0, 20),
        kind: input.kind,
        purpose: input.purpose?.trim().slice(0, 250) || null,
        amount: input.amount,
        status: "PENDING",
        linkId: link.id,
        linkUrl: link.short_url,
        expiresAt: input.expireAt,
        channel: input.channel,
        requestedById: input.requestedById ?? null,
      },
    });
    console.log(
      `[payment] link ${link.id} request=${row.id} kind=${input.kind} amount=${input.amount}`,
    );
    void broadcastPayment(row);
    return row;
  },

  /** Staff request: any amount, sent to the patient on WhatsApp. */
  async createCustom(
    actorUserId: string,
    input: {
      practiceId: string;
      bookingId?: string | null;
      patientId?: string | null;
      patientName?: string | null;
      patientPhone?: string | null;
      providerId?: string | null;
      amount: unknown;
      purpose?: string | null;
      expiresInDays?: unknown;
      channel: "WEB_PORTAL" | "PROVIDER_APP";
    },
  ) {
    const practiceId = input.practiceId;
    if (!practiceId) throw new AppError(400, "practiceId is required.");
    const member = await PracticeService.assertMember(practiceId, actorUserId);
    if (!razorpay.isConfigured()) {
      throw new AppError(503, "Online payments are not set up yet.");
    }
    const amount = parseCustomAmountPaise(input.amount);
    if (amount == null) {
      throw new AppError(400, "Enter an amount between ₹1 and ₹5,00,000.");
    }
    const purpose = String(input.purpose ?? "").trim().slice(0, 120);
    if (!purpose) throw new AppError(400, "Add what the payment is for.");

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { name: true, isActive: true },
    });
    if (!practice?.isActive) throw new AppError(404, "practice not found.");

    let providerId: string | null;
    let bookingId: string | null = null;
    let patientId: string | null = null;
    let patientName: string | null;
    let patientPhone: string | null;

    if (input.bookingId) {
      const booking = await prisma.practiceBooking.findUnique({
        where: { id: String(input.bookingId) },
        select: {
          id: true,
          practiceId: true,
          providerId: true,
          patientId: true,
          patientName: true,
          patientPhone: true,
        },
      });
      if (!booking || booking.practiceId !== practiceId) {
        throw new AppError(404, "booking not found.");
      }
      await PracticeService.assertCanViewBooking(
        practiceId,
        actorUserId,
        booking.providerId,
      );
      bookingId = booking.id;
      providerId = booking.providerId;
      patientId = booking.patientId;
      patientName = booking.patientName;
      patientPhone = normalizePatientPhone(booking.patientPhone);
    } else {
      patientPhone = normalizePatientPhone(input.patientPhone);
      patientName = String(input.patientName ?? "").trim().slice(0, 120) || null;
      if (!patientName) throw new AppError(400, "Enter the patient name.");
      const isAdmin =
        member.role === "PRACTICE_OWNER" || member.role === "PRACTICE_ADMIN";
      providerId = actorUserId;
      if (isAdmin && input.providerId && input.providerId !== actorUserId) {
        const provider = await prisma.practiceMember.findFirst({
          where: { practiceId, userId: String(input.providerId), isActive: true },
          select: { userId: true },
        });
        if (!provider) throw new AppError(400, "That doctor is not in this clinic.");
        providerId = provider.userId;
      }
      if (input.patientId) {
        const known = await prisma.practiceBooking.findFirst({
          where: { practiceId, patientId: String(input.patientId) },
          select: { patientId: true },
        });
        patientId = known?.patientId ?? null;
      }
    }
    if (!patientPhone) {
      throw new AppError(400, "Enter a valid patient mobile number.");
    }

    const row = await this.createLinkRecord({
      practiceId,
      practiceName: practice.name,
      providerId,
      bookingId,
      patientId,
      patientName,
      patientPhone,
      kind: "CUSTOM",
      purpose,
      amount,
      expireAt: customLinkExpiry(input.expiresInDays),
      channel: input.channel,
      requestedById: actorUserId,
    });
    const sent = await sendRequestMessage(row, practice.name);
    const final = "updated" in sent && sent.updated ? sent.updated : row;
    void broadcastPayment(final);
    const names = await userNames([final.providerId, final.requestedById]);
    return paymentRequestView(final, names);
  },

  async assertAccess(id: string, actorUserId: string) {
    const row = await prisma.paymentRequest.findUnique({ where: { id } });
    if (!row) throw new AppError(404, "payment request not found.");
    const scope = await PracticeService.resolveDataProviderScope(
      row.practiceId,
      actorUserId,
    );
    if (scope && row.providerId !== scope) {
      throw new AppError(403, "You can only see your own patients' payments.");
    }
    return row;
  },

  async get(id: string, actorUserId: string) {
    const row = await this.assertAccess(id, actorUserId);
    const names = await userNames([row.providerId, row.requestedById]);
    return paymentRequestView(row, names);
  },

  /** Re-send a pending request on WhatsApp. */
  async resend(id: string, actorUserId: string) {
    const row = await this.assertAccess(id, actorUserId);
    if (row.status !== "PENDING") {
      throw new AppError(400, "Only pending payment requests can be re-sent.");
    }
    const practice = await prisma.practice.findUniqueOrThrow({
      where: { id: row.practiceId },
      select: { name: true },
    });
    const sent = await sendRequestMessage(row, practice.name);
    const final = "updated" in sent && sent.updated ? sent.updated : row;
    void broadcastPayment(final);
    const names = await userNames([final.providerId, final.requestedById]);
    return paymentRequestView(final, names);
  },

  async cancel(id: string, actorUserId: string) {
    const row = await this.assertAccess(id, actorUserId);
    if (row.status !== "PENDING" || !row.linkId) {
      throw new AppError(400, "Only pending payment requests can be cancelled.");
    }
    try {
      await razorpay.cancelPaymentLink(row.linkId);
    } catch (err) {
      // Paid / expired meanwhile — record Razorpay's actual state instead.
      await this.refreshRow(row);
      const latest = await prisma.paymentRequest.findUniqueOrThrow({ where: { id } });
      if (latest.status !== "PENDING") {
        throw new AppError(
          409,
          latest.status === "PAID"
            ? "This request was already paid."
            : "This link is no longer active.",
        );
      }
      throw err;
    }
    await this.applyLinkState(row.linkId, "CANCELLED");
    return this.get(id, actorUserId);
  },

  async refresh(id: string, actorUserId: string) {
    const row = await this.assertAccess(id, actorUserId);
    await this.refreshRow(row);
    return this.get(id, actorUserId);
  },

  /** Ask Razorpay for the latest link state (used when no webhook arrived). */
  async refreshRow(row: PaymentRequest) {
    if (row.status !== "PENDING" || !row.linkId || !razorpay.isConfigured()) {
      return row;
    }
    const link = await razorpay.getPaymentLink(row.linkId);
    const next = statusFromLink(link);
    if (next === "PENDING") return row;
    const paid =
      link.payments?.find((p) => p.status === "captured") ?? link.payments?.[0];
    return (await this.applyLinkState(link.id, next, paid?.payment_id)) ?? row;
  },

  async refreshByLinkId(linkId: string) {
    const row = await prisma.paymentRequest.findUnique({ where: { linkId } });
    if (row) await this.refreshRow(row);
  },

  /** Pending links past their Razorpay expiry can no longer be paid. */
  async expireStale(practiceId: string, now = new Date()) {
    const stale = await prisma.paymentRequest.findMany({
      where: {
        practiceId,
        status: "PENDING",
        expiresAt: { lt: new Date(now.getTime() - EXPIRY_GRACE_MS) },
      },
      take: 200,
    });
    for (const row of stale) {
      if (row.linkId) await this.applyLinkState(row.linkId, "EXPIRED");
    }
  },

  async list(
    practiceId: string,
    actorUserId: string,
    opts: {
      status?: string;
      from?: string;
      to?: string;
      q?: string;
      providerId?: string;
      take?: number;
    } = {},
  ) {
    const scope = await PracticeService.resolveDataProviderScope(
      practiceId,
      actorUserId,
      opts.providerId,
    );
    await this.expireStale(practiceId).catch((err) =>
      console.warn("[payment] expireStale failed:", err),
    );

    const createdAt: Prisma.DateTimeFilter = {};
    if (opts.from) {
      const d = new Date(opts.from);
      if (!Number.isNaN(d.getTime())) createdAt.gte = d;
    }
    if (opts.to) {
      const d = new Date(opts.to);
      if (!Number.isNaN(d.getTime())) createdAt.lte = d;
    }
    const q = opts.q?.trim();
    const base: Prisma.PaymentRequestWhereInput = {
      practiceId,
      ...(scope ? { providerId: scope } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              { patientName: { contains: q, mode: "insensitive" } },
              { patientPhone: { contains: q.replace(/\D/g, "") || q } },
              { purpose: { contains: q, mode: "insensitive" } },
              { paymentId: { contains: q } },
            ],
          }
        : {}),
    };
    const status = opts.status?.toUpperCase();
    const where: Prisma.PaymentRequestWhereInput =
      status && ["PENDING", "PAID", "EXPIRED", "CANCELLED"].includes(status)
        ? { ...base, status }
        : base;

    const [rows, grouped] = await Promise.all([
      prisma.paymentRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(Number(opts.take) || 200, 1), 500),
      }),
      prisma.paymentRequest.groupBy({
        by: ["status"],
        where: base,
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const names = await userNames(
      rows.flatMap((r) => [r.providerId, r.requestedById]),
    );
    const bucket = (s: string) => grouped.find((g) => g.status === s);
    return {
      items: rows.map((r) => paymentRequestView(r, names)),
      summary: {
        collected: bucket("PAID")?._sum.amount ?? 0,
        paidCount: bucket("PAID")?._count._all ?? 0,
        pending: bucket("PENDING")?._sum.amount ?? 0,
        pendingCount: bucket("PENDING")?._count._all ?? 0,
        closedCount:
          (bucket("EXPIRED")?._count._all ?? 0) +
          (bucket("CANCELLED")?._count._all ?? 0),
        total: grouped.reduce((n, g) => n + g._count._all, 0),
      },
      paymentsEnabled: razorpay.isConfigured(),
    };
  },

  async listForBooking(bookingId: string) {
    const rows = await prisma.paymentRequest.findMany({
      where: { bookingId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const names = await userNames(
      rows.flatMap((r) => [r.providerId, r.requestedById]),
    );
    return rows.map((r) => paymentRequestView(r, names));
  },

  /**
   * Apply a Razorpay link state (callback / webhook / refresh). PAID is
   * recorded once and the patient gets one WhatsApp receipt.
   */
  async applyLinkState(
    linkId: string,
    next: PaymentRequestStatus,
    paymentId?: string | null,
  ): Promise<PaymentRequest | null> {
    const row = await prisma.paymentRequest.findUnique({ where: { linkId } });
    if (!row) return null;
    if (row.status === "PAID" || row.status === next) return row;

    if (next === "PAID") {
      const paidAt = new Date();
      const res = await prisma.paymentRequest.updateMany({
        where: { id: row.id, status: { not: "PAID" } },
        data: { status: "PAID", paymentId: paymentId ?? null, paidAt },
      });
      const updated = await prisma.paymentRequest.findUniqueOrThrow({
        where: { id: row.id },
      });
      await syncBooking(updated, {
        paymentStatus: "PAID",
        paymentId: paymentId ?? null,
        paidAt,
      });
      void broadcastPayment(updated);
      if (res.count) {
        const practice = await prisma.practice.findUnique({
          where: { id: updated.practiceId },
          select: { name: true },
        });
        const purpose = await receiptPurpose(updated);
        void practicePhoneNumberId(updated.practiceId)
          .then((phoneId) =>
            sendNotificationWhatsApp(
              updated.patientPhone,
              "PAYMENT_RECEIVED",
              {
                amountLabel: formatRupees(updated.amount),
                practiceName: practice?.name ?? "your clinic",
                purpose,
                paymentId: paymentId ?? "—",
              },
              phoneId,
            ),
          )
          .catch(() => undefined);
        console.log(
          `[payment] PAID request=${updated.id} booking=${updated.bookingId ?? "-"} payment=${paymentId ?? "-"}`,
        );
      }
      return updated;
    }

    const res = await prisma.paymentRequest.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: next },
    });
    const updated = await prisma.paymentRequest.findUniqueOrThrow({
      where: { id: row.id },
    });
    if (res.count) {
      await syncBooking(updated, { paymentStatus: next });
      void broadcastPayment(updated);
    }
    return updated;
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
    const row = await this.applyLinkState(
      paymentLinkId,
      statusFromLink({ status: status as RazorpayPaymentLink["status"] }),
      paymentId || null,
    );
    return {
      ok: true as const,
      paid: status === "paid",
      label: row ? kindLabel(row.kind, row.purpose) : null,
      amount: row?.amount ?? null,
    };
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
