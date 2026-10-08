import { api, setRefreshToken, setToken } from "@/lib/api";
import type {
  AuditLogPage,
  BookingRow,
  OverrideRow,
  PracticeMembership,
  PracticePatient,
  ScheduleRow,
} from "@/lib/types";

export async function fetchMyPractices() {
  return api<PracticeMembership[]>("/procto/practices/mine");
}

/** Memberships + bookings + patients in one round-trip (cuts shell waterfall). */
export async function fetchPracticeBootstrap(opts?: {
  date?: string;
  from?: string;
  to?: string;
  practiceId?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.date) params.set("date", opts.date);
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  if (opts?.practiceId) params.set("practiceId", opts.practiceId);
  const qs = params.toString();
  return api<{
    memberships: PracticeMembership[];
    practiceId?: string;
    bookings: BookingRow[];
    patients: PracticePatient[];
  }>(`/procto/practices/mine/bootstrap${qs ? `?${qs}` : ""}`);
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

export type DeskPatient = {
  patientId: string;
  name: string;
  mrn: string | null;
  phone: string;
  gender: string | null;
  dateOfBirth: string | null;
  age: number | null;
  relationship: string | null;
  knownHere: boolean;
  lastVisitAt: string | null;
  existingPatient?: boolean;
};

export async function searchDeskPatients(practiceId: string, q: string) {
  return api<{ patients: DeskPatient[] }>(
    `/procto/practices/${practiceId}/desk-patients?q=${encodeURIComponent(q)}`,
  );
}

export async function registerDeskPatient(
  practiceId: string,
  body: {
    name: string;
    phone: string;
    gender: "male" | "female" | "others";
    dateOfBirth: string;
    email?: string;
    relationship?: string;
  },
) {
  return api<DeskPatient>(`/procto/practices/${practiceId}/desk-patients`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function linkDeskPatient(practiceId: string, patientId: string) {
  return api<DeskPatient>(
    `/procto/practices/${practiceId}/desk-patients/${patientId}/link`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function fetchGeneralDocuments(bookingId: string) {
  return api<{
    patientLinked: boolean;
    documents: Array<{ name: string; url: string; uploadedAt?: string }>;
  }>(`/procto/bookings/${bookingId}/general-documents`);
}

export async function addGeneralDocument(
  bookingId: string,
  doc: { name: string; url: string },
) {
  return api(`/procto/bookings/${bookingId}/general-documents`, {
    method: "POST",
    body: JSON.stringify(doc),
  });
}

/** Finished visit: clinic log and Rx summary on the patient's WhatsApp. */
export async function sendClinicLogWhatsApp(bookingId: string) {
  return api(`/procto/bookings/${bookingId}/send-clinic-log`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function createWalkIn(body: {
  practiceId: string;
  providerId: string;
  patientId: string;
  patientPhone: string;
  disease?: string;
}) {
  return api<BookingRow>("/procto/bookings/walk-in", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateBookingStatus(
  bookingId: string,
  status: string,
  cancelReason?: string,
) {
  return api(`/procto/bookings/${bookingId}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      ...(cancelReason ? { cancelReason } : {}),
    }),
  });
}

export async function updateVisit(
  bookingId: string,
  body: {
    doctorRemarks?: string;
    medicines?: Array<{ name: string; amount?: string; times?: string[] }>;
    documents?: Array<{ name: string; url: string; uploadedAt?: string }>;
    clinicalAssessment?: unknown;
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

/** Practice profile fields (name, fees, address, contact, …). */
export async function updatePracticeProfile(
  practiceId: string,
  body: Record<string, unknown>,
) {
  return api(`/procto/practices/${practiceId}/profile`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchAuditLog(
  practiceId: string,
  q: {
    action?: string;
    providerId?: string;
    from?: string;
    to?: string;
    before?: string;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return api<AuditLogPage>(
    `/procto/practices/${practiceId}/audit${qs ? `?${qs}` : ""}`,
  );
}

export type SpecialtyOption = { id: string; name: string; slug: string };

export async function listSpecialties(opts?: { hasDoctors?: boolean }) {
  const qs = opts?.hasDoctors ? "?has_doctors=true" : "";
  return api<SpecialtyOption[]>(`/procto/specialties${qs}`);
}

export async function createSpecialty(name: string) {
  return api<SpecialtyOption>("/procto/specialties", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function createPracticeDoctor(
  practiceId: string,
  body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    specialty?: string;
    specialtyIds?: string[];
    licenseNo?: string;
  },
) {
  return api(`/procto/practices/${practiceId}/doctors`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createPracticeStaff(
  practiceId: string,
  body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role: "PRACTICE_ADMIN" | "RECEPTIONIST" | "NURSE";
  },
) {
  return api(`/procto/practices/${practiceId}/staff`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function openPracticeSchedule(
  practiceId: string,
  userId: string,
  specialtyIds?: string[],
) {
  return api(`/procto/practices/${practiceId}/members/${userId}/open-schedule`, {
    method: "POST",
    body: JSON.stringify({ specialtyIds: specialtyIds ?? [] }),
  });
}

export async function setPracticeMemberActive(
  practiceId: string,
  userId: string,
  isActive: boolean,
) {
  return api(`/procto/practices/${practiceId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
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
    features?: Record<string, unknown>;
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
