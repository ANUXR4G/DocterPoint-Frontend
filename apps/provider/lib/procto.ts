import { api } from "@/lib/api";
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
  return api<ScheduleRow[]>(`/procto/practices/${practiceId}/schedules${qs}`);
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
  opts?: { status?: string; take?: number },
) {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
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

