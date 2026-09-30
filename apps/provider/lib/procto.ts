import { api, setRefreshToken, setToken } from "@/lib/api";
import type {
  BookingRow,
  OverrideRow,
  PracticeMembership,
  PracticePatient,
  ScheduleRow,
} from "@/lib/types";

export async function fetchMyPractices() {
  return api<PracticeMembership[]>("/procto/practices/mine");
}

export async function fetchPracticeBookings(
  practiceId: string,
  opts: { date?: string; from?: string; to?: string; providerId?: string },
) {
  const params = new URLSearchParams();
  if (opts.date) params.set("date", opts.date);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  if (opts.providerId) params.set("providerId", opts.providerId);
  const qs = params.toString();
  return api<BookingRow[]>(
    `/procto/bookings/practice/${practiceId}${qs ? `?${qs}` : ""}`,
  );
}

export async function fetchBooking(bookingId: string) {
  return api<BookingRow>(`/procto/bookings/${bookingId}`);
}

export async function updateBookingStatus(bookingId: string, status: string) {
  return api(`/procto/bookings/${bookingId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateVisit(
  bookingId: string,
  body: {
    doctorRemarks?: string;
    medicines?: Array<{ name: string; amount?: string; times?: string[] }>;
    documents?: Array<{ name: string; url: string; uploadedAt?: string }>;
    status?: string;
  },
) {
  return api(`/procto/bookings/${bookingId}/visit`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function upsertSchedule(
  practiceId: string,
  body: Record<string, unknown>,
) {
  return api(`/procto/practices/${practiceId}/schedules`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function fetchPracticeAnalytics(
  practiceId: string,
  opts: { type?: string; providerId?: string } = {},
) {
  const params = new URLSearchParams();
  if (opts.type) params.set("type", opts.type);
  if (opts.providerId) params.set("providerId", opts.providerId);
  const qs = params.toString();
  return api<Record<string, unknown>>(
    `/procto/practices/${practiceId}/analytics${qs ? `?${qs}` : ""}`,
  );
}

export async function fetchPracticePatients(practiceId: string) {
  return api<PracticePatient[]>(`/procto/practices/${practiceId}/patients`);
}

export async function fetchSchedules(practiceId: string, providerId?: string) {
  const qs = providerId ? `?providerId=${providerId}` : "";
  const res = await api<
    | ScheduleRow[]
    | {
        schedules?: ScheduleRow[];
        pendingModeChange?: {
          toMode: string;
          fromMode?: string | null;
          effectiveDate: string;
        } | null;
      }
  >(`/procto/practices/${practiceId}/schedules${qs}`);
  if (res.status === "successful" && res.data && !Array.isArray(res.data)) {
    return {
      ...res,
      data: res.data.schedules ?? [],
      pendingModeChange: res.data.pendingModeChange ?? null,
    };
  }
  return { ...res, pendingModeChange: null as null };
}

/** Signed-in user's own photo; `null` removes it. */
export async function updateMyPhoto(imgSrc: string | null) {
  const res = await api<{
    imgSrc: string | null;
    access_token?: string;
    refresh_token?: string;
  }>("/auth/me/photo", {
    method: "PUT",
    body: JSON.stringify({ imgSrc }),
  });
  // The access JWT carries imgSrc; keep the stored session in sync.
  if (res.status === "successful" && res.data?.access_token) {
    await setToken(res.data.access_token);
    if (res.data.refresh_token) await setRefreshToken(res.data.refresh_token);
  }
  return res;
}

/** Clinic logo (owner / admin, or a solo doctor); `null` removes it. */
export async function updatePracticeLogo(practiceId: string, bgSrc: string | null) {
  return api(`/procto/practices/${practiceId}/profile`, {
    method: "PATCH",
    body: JSON.stringify({ bgSrc }),
  });
}

export async function saveProviderSettings(
  practiceId: string,
  body: Record<string, unknown>,
) {
  return api(`/procto/practices/${practiceId}/provider-settings`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function fetchOverrides(practiceId: string, providerId?: string) {
  const qs = providerId ? `?providerId=${providerId}` : "";
  return api<OverrideRow[]>(`/procto/practices/${practiceId}/overrides${qs}`);
}

export async function createOverride(
  practiceId: string,
  body: Record<string, unknown>,
) {
  return api(`/procto/practices/${practiceId}/overrides`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchConversations(practiceId: string) {
  return api<
    Array<{
      id: string;
      patientPhone: string;
      status: string;
      updatedAt: string;
    }>
  >(`/procto/practices/${practiceId}/conversations`);
}

export type PracticeNotificationRow = {
  id: string;
  type: string;
  channel: string;
  status: string;
  templateKey: string;
  recipientRole: string;
  to: string;
  title: string;
  summary: string;
  sentAt: string | null;
  createdAt: string;
  booking?: {
    id: string;
    patientPhone: string;
    patientName: string | null;
    status: string;
  } | null;
};

export async function fetchPracticeNotifications(
  practiceId: string,
  opts?: { status?: string; kind?: string; take?: number },
) {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
  if (opts?.kind) qs.set("kind", opts.kind);
  if (opts?.take != null) qs.set("take", String(opts.take));
  const q = qs.toString();
  return api<{
    total: number;
    pendingCount: number;
    failedCount: number;
    sentCount: number;
    items: PracticeNotificationRow[];
  }>(`/procto/practices/${practiceId}/notifications${q ? `?${q}` : ""}`);
}

export async function dismissPracticeNotification(
  practiceId: string,
  notificationId: string,
) {
  return api<{ id: string; dismissed: boolean }>(
    `/procto/practices/${practiceId}/notifications/${notificationId}/dismiss`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function setConversationStatus(
  practiceId: string,
  conversationId: string,
  status: "bot_active" | "handed_off" | "closed",
) {
  return api(`/procto/practices/${practiceId}/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export type ClinicPlan = {
  id: string;
  name: string;
  priceMonthlyInr: number;
  priceYearlyInr?: number | null;
  maxBookingsPerMonth?: number | null;
  features?: Record<string, unknown>;
};

export type PracticeSubscription = {
  id: string;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  plan: ClinicPlan;
  pendingPlan?: ClinicPlan | null;
};

export type RazorpaySubCheckout = {
  keyId: string;
  subscriptionId: string;
  planName: string;
  amountInr: number;
};

export type PracticeBilling = {
  practice: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  subscription: PracticeSubscription | null;
  plans: ClinicPlan[];
  entitlement?: {
    usable: boolean;
    planName: string | null;
    maxBookingsPerMonth: number | null;
    bookingsUsedThisPeriod: number;
  };
  scheduledPlan?: ClinicPlan | null;
  pendingCheckoutPlan?: ClinicPlan | null;
  razorpayConfigured?: boolean;
  razorpayKeyId?: string | null;
};

export async function fetchPracticeBilling(practiceId: string) {
  return api<PracticeBilling>(`/procto/practices/${practiceId}/billing`);
}

export async function subscribePractice(
  practiceId: string,
  body: { planId: string; mode?: "trial" | "activate" | "change" },
) {
  return api<{
    subscription?: PracticeSubscription;
    checkout?: RazorpaySubCheckout | null;
    scheduledPlan?: ClinicPlan | null;
    effectiveAt?: string;
  }>(`/procto/practices/${practiceId}/billing/subscribe`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function confirmPracticeBilling(
  practiceId: string,
  body: {
    razorpayPaymentId: string;
    razorpaySubscriptionId: string;
    razorpaySignature: string;
  },
) {
  return api(`/procto/practices/${practiceId}/billing/confirm`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function cancelPendingCheckout(practiceId: string) {
  return api(`/procto/practices/${practiceId}/billing/cancel-checkout`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}


export type PaymentRequestStatus = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";

export type PaymentRequestRow = {
  id: string;
  kind: "ADVANCE" | "CONSULTATION" | "CUSTOM";
  label: string;
  purpose: string | null;
  /** Paise. */
  amount: number;
  status: PaymentRequestStatus;
  linkUrl: string | null;
  paymentId: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  patientName: string | null;
  patientPhone: string;
  patientId: string | null;
  bookingId: string | null;
  providerId: string | null;
  providerName: string | null;
  requestedByName: string | null;
  channel: "WHATSAPP_BOT" | "WEB_PORTAL" | "PROVIDER_APP";
  waDelivery: "SENT" | "FAILED" | "SIMULATED" | null;
  waError: string | null;
  receiptDelivery: "SENDING" | "SENT" | "FAILED" | "SIMULATED" | null;
  receiptError: string | null;
};

export type PaymentsListResponse = {
  items: PaymentRequestRow[];
  summary: {
    collected: number;
    paidCount: number;
    pending: number;
    pendingCount: number;
    closedCount: number;
    total: number;
  };
  paymentsEnabled: boolean;
};

export async function fetchPayments(
  practiceId: string,
  opts: { status?: string; from?: string; q?: string } = {},
) {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.from) params.set("from", opts.from);
  if (opts.q) params.set("q", opts.q);
  const qs = params.toString();
  return api<PaymentsListResponse>(
    `/procto/payments/practice/${practiceId}${qs ? `?${qs}` : ""}`,
  );
}

export async function createPaymentRequest(body: {
  practiceId: string;
  bookingId?: string;
  patientId?: string | null;
  patientName?: string;
  patientPhone?: string;
  amount: string;
  purpose: string;
  expiresInDays?: number;
}) {
  return api<PaymentRequestRow>("/procto/payments/requests", {
    method: "POST",
    body: JSON.stringify({ ...body, channel: "PROVIDER_APP" }),
  });
}

export async function refreshPaymentRequest(id: string) {
  return api<PaymentRequestRow>(`/procto/payments/requests/${id}?refresh=1`);
}

export async function resendPaymentRequest(id: string) {
  return api<PaymentRequestRow>(`/procto/payments/requests/${id}/resend`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelPaymentRequest(id: string) {
  return api<PaymentRequestRow>(`/procto/payments/requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
