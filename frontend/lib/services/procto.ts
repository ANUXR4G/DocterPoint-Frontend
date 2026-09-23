import { cookies } from "@/utils/cookies";
import { firey } from "@/utils";

const base =
  process.env.NEXT_PUBLIC_API ?? "http://localhost:3000/api/v1";

let refreshPromise: Promise<string | null> | null = null;
let invalidateMyPracticesCacheImpl: (() => void) | null = null;

async function ensureAccessToken(): Promise<string> {
  const access = cookies.getCookie("access_token");
  if (access) {
    try {
      if (firey.getTokenDuration(access) >= Date.now() / 1000) return access;
    } catch {
      /* refresh below */
    }
  }

  const refresh = cookies.getCookie("refresh_token");
  if (!refresh) return access || "";

  if (refreshPromise) return (await refreshPromise) || access || "";

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${base}/auth/token/refresh`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refresh}`,
        },
      });
      if (response.status === 429 || response.status >= 500) {
        return cookies.getCookie("access_token") || refresh;
      }
      if (!response.ok) return null;
      await response.json().catch(() => null);
      return cookies.getCookie("access_token") || refresh;
    } catch {
      return cookies.getCookie("access_token") || refresh;
    } finally {
      refreshPromise = null;
    }
  })();

  return (await refreshPromise) || access || "";
}

async function proctoFetch(path: string, init?: RequestInit) {
  const token = await ensureAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });

  // One retry after forced refresh on 401
  if (res.status === 401 && cookies.getCookie("refresh_token")) {
    refreshPromise = null;
    const retryToken = await ensureAccessToken();
    if (retryToken) {
      const retry = await fetch(`${base}${path}`, {
        credentials: "include",
        ...init,
        headers: { ...headers, Authorization: `Bearer ${retryToken}` },
      });
      const text = await retry.text();
      if (
        !retry.ok ||
        text.trim().startsWith("<!") ||
        text.trim().startsWith("<html")
      ) {
        return { status: "unsuccessful", message: "Service unavailable" };
      }
      try {
        return JSON.parse(text);
      } catch {
        return { status: "unsuccessful", message: "Invalid API response" };
      }
    }
  }

  const text = await res.text();
  if (
    !res.ok ||
    text.trim().startsWith("<!") ||
    text.trim().startsWith("<html")
  ) {
    try {
      return JSON.parse(text);
    } catch {
      return { status: "unsuccessful", message: "Service unavailable" };
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return { status: "unsuccessful", message: "Invalid API response" };
  }
}

export const proctoService = {
  listPractices: (params?: { q?: string; city?: string; specialty?: string }) => {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.city) search.set("city", params.city);
    if (params?.specialty) search.set("specialty", params.specialty);
    const qs = search.toString();
    return proctoFetch(`/procto/practices${qs ? `?${qs}` : ""}`);
  },

  getPractice: (slug: string) => proctoFetch(`/procto/practices/${slug}`),

  getAvailability: (params: {
    practiceId: string;
    providerId: string;
    locationId: string;
    date: string;
  }) => {
    const search = new URLSearchParams(params);
    return proctoFetch(`/procto/bookings/availability?${search}`);
  },

  createBooking: (body: Record<string, unknown>) =>
    proctoFetch("/procto/bookings", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getBooking: (id: string) => proctoFetch(`/procto/bookings/${id}`),

  getMyBookings: () => proctoFetch("/procto/bookings/mine"),

  cancelBooking: (id: string, phone?: string, reason?: string) =>
    proctoFetch(`/procto/bookings/${id}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(phone ? { phone } : {}),
        ...(reason ? { reason } : {}),
      }),
    }),

  onboardPractice: (body: Record<string, unknown>) =>
    proctoFetch("/procto/practices/onboard", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMyPractices: (() => {
    let cached: { at: number; promise: Promise<any> } | null = null;
    const TTL_MS = 30_000;
    invalidateMyPracticesCacheImpl = () => {
      cached = null;
    };
    return () => {
      const now = Date.now();
      if (cached && now - cached.at < TTL_MS) return cached.promise;
      const promise = proctoFetch("/procto/practices/mine").then((res) => {
        if (res?.status !== "successful") {
          cached = null;
        }
        return res;
      });
      cached = { at: now, promise };
      return promise;
    };
  })(),

  /** Call after login / register / onboard so roster is not stuck on a stale cache. */
  invalidateMyPracticesCache: () => {
    invalidateMyPracticesCacheImpl?.();
  },

  /**
   * Single call: memberships + bookings (date / from-to). Prefer for queue &
   * appointments to avoid mine→bookings waterfall.
   */
  getPracticeBootstrap: (opts?: {
    date?: string;
    from?: string;
    to?: string;
  }) => {
    const params = new URLSearchParams();
    if (opts?.date) params.set("date", opts.date);
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    const qs = params.toString();
    return proctoFetch(
      `/procto/practices/mine/bootstrap${qs ? `?${qs}` : ""}`,
    );
  },

  /**
   * `/procto/practices/mine` rows are memberships. Prefer practiceId / nested
   * practice.id — never assume top-level id alone without this helper.
   */
  resolvePracticeId(
    row:
      | {
          id?: string;
          practiceId?: string;
          practice?: { id?: string } | null;
        }
      | null
      | undefined,
  ): string | null {
    if (!row) return null;
    return row.practiceId || row.practice?.id || row.id || null;
  },

  updatePracticeProfile: (practiceId: string, body: Record<string, unknown>) =>
    proctoFetch(`/procto/practices/${practiceId}/profile`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getCalendar: (practiceId: string, providerId: string, date: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/calendar?providerId=${providerId}&date=${date}`,
    ),

  getSchedules: (practiceId: string, providerId?: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/schedules${providerId ? `?providerId=${providerId}` : ""}`,
    ),

  saveSchedule: (practiceId: string, body: Record<string, unknown>) =>
    proctoFetch(`/procto/practices/${practiceId}/schedules`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  saveProviderSettings: (practiceId: string, body: Record<string, unknown>) =>
    proctoFetch(`/procto/practices/${practiceId}/provider-settings`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getOverrides: (practiceId: string, providerId?: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/overrides${providerId ? `?providerId=${providerId}` : ""}`,
    ),

  createOverride: (practiceId: string, body: Record<string, unknown>) =>
    proctoFetch(`/procto/practices/${practiceId}/overrides`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateBookingStatus: (bookingId: string, status: string) =>
    proctoFetch(`/procto/bookings/${bookingId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  updateBookingVisit: (
    bookingId: string,
    body: {
      doctorRemarks?: string | null;
      medicines?: Array<{ name: string; amount?: string; times?: string[] }>;
      documents?: Array<{ name: string; url: string; uploadedAt?: string }>;
      status?: string;
    },
  ) =>
    proctoFetch(`/procto/bookings/${bookingId}/visit`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  listPracticeBookings: (
    practiceId: string,
    opts?:
      | string
      | {
          date?: string;
          from?: string;
          to?: string;
          providerId?: string;
        },
  ) => {
    const params = new URLSearchParams();
    if (typeof opts === "string") {
      if (opts) params.set("date", opts);
    } else if (opts) {
      if (opts.date) params.set("date", opts.date);
      if (opts.from) params.set("from", opts.from);
      if (opts.to) params.set("to", opts.to);
      if (opts.providerId) params.set("providerId", opts.providerId);
    }
    const qs = params.toString();
    return proctoFetch(
      `/procto/bookings/practice/${practiceId}${qs ? `?${qs}` : ""}`,
    );
  },

  listPracticePatients: (practiceId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/patients`),

  listPracticeNotifications: (
    practiceId: string,
    opts?: { status?: string; take?: number; skip?: number },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.status) qs.set("status", opts.status);
    if (opts?.take != null) qs.set("take", String(opts.take));
    if (opts?.skip != null) qs.set("skip", String(opts.skip));
    const q = qs.toString();
    return proctoFetch(
      `/procto/practices/${practiceId}/notifications${q ? `?${q}` : ""}`,
    );
  },

  dismissPracticeNotification: (practiceId: string, notificationId: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/notifications/${notificationId}/dismiss`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  getPracticeAnalytics: (
    practiceId: string,
    type: string,
    providerId?: string | null,
  ) => {
    const qs = new URLSearchParams({ type });
    if (providerId) qs.set("providerId", providerId);
    return proctoFetch(
      `/procto/practices/${practiceId}/analytics?${qs.toString()}`,
    );
  },

  addPracticeDoctor: (practiceId: string, body: Record<string, unknown>) =>
    proctoFetch(`/procto/practices/${practiceId}/doctors`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  setPracticeMemberActive: (
    practiceId: string,
    userId: string,
    isActive: boolean,
  ) =>
    proctoFetch(`/procto/practices/${practiceId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),

  adminListNumbers: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return proctoFetch(`/procto/admin/numbers${qs}`);
  },

  adminAddNumber: (body: {
    phoneNumber: string;
    displayName?: string;
    notes?: string;
  }) =>
    proctoFetch("/procto/admin/numbers", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  adminAssignNumber: (body: {
    practiceId: string;
    phoneNumber?: string;
    mockGoLive?: boolean;
  }) =>
    proctoFetch("/procto/admin/numbers/assign", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  adminSuspendNumber: (practiceId: string) =>
    proctoFetch("/procto/admin/numbers/suspend", {
      method: "POST",
      body: JSON.stringify({ practiceId }),
    }),

  adminListPlans: () => proctoFetch("/procto/admin/plans"),

  listPlans: () => proctoFetch("/procto/practices/plans"),

  getPracticeBilling: (practiceId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/billing`),

  subscribePractice: (
    practiceId: string,
    body: { planId: string; mode?: "trial" | "activate" | "change" },
  ) =>
    proctoFetch(`/procto/practices/${practiceId}/billing/subscribe`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  confirmPracticeBilling: (
    practiceId: string,
    body?: {
      razorpayPaymentId?: string
      razorpaySubscriptionId?: string
      razorpaySignature?: string
    },
  ) =>
    proctoFetch(`/procto/practices/${practiceId}/billing/confirm`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  cancelPendingCheckout: (practiceId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/billing/cancel-checkout`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  cancelScheduledPlanChange: (practiceId: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/billing/cancel-scheduled-change`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    ),

  connectPracticeWhatsApp: (
    practiceId: string,
    body: {
      phoneNumber: string
      wabaPhoneNumberId?: string
      wabaId?: string
      oauthCode?: string
    },
  ) =>
    proctoFetch(`/procto/practices/${practiceId}/whatsapp/connect`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  resolvePracticeWhatsApp: (practiceId: string, phoneNumber: string) =>
    proctoFetch(`/procto/practices/${practiceId}/whatsapp/resolve`, {
      method: "POST",
      body: JSON.stringify({ phoneNumber }),
    }),

  getPracticeWhatsAppStatus: (practiceId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/whatsapp/status`),

  refreshPracticeWhatsAppProvision: (practiceId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/whatsapp/provision/refresh`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  requestWhatsAppVerifyOtp: (
    practiceId: string,
    body?: { method?: "SMS" | "VOICE" },
  ) =>
    proctoFetch(`/procto/practices/${practiceId}/whatsapp/verify/request`, {
      method: "POST",
      body: JSON.stringify(body ?? { method: "SMS" }),
    }),

  confirmWhatsAppVerifyOtp: (practiceId: string, code: string) =>
    proctoFetch(`/procto/practices/${practiceId}/whatsapp/verify/confirm`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  adminListTemplates: (practiceId?: string) => {
    const qs = practiceId
      ? `?practiceId=${encodeURIComponent(practiceId)}`
      : "";
    return proctoFetch(`/procto/admin/templates${qs}`);
  },

  adminListSubscriptions: () => proctoFetch("/procto/admin/subscriptions"),

  adminBillingSimulate: (body: { practiceId: string; action: string }) =>
    proctoFetch("/procto/admin/billing/simulate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  adminListEscalations: () => proctoFetch("/procto/admin/escalations"),

  listConversations: (practiceId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/conversations`),

  setConversationStatus: (
    practiceId: string,
    conversationId: string,
    status: "bot_active" | "handed_off" | "closed",
  ) =>
    proctoFetch(`/procto/practices/${practiceId}/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  submitReview: (
    practiceId: string,
    body: {
      bookingId: string;
      authorName?: string;
      rating: number;
      providerRating?: number;
      body?: string;
    },
  ) =>
    proctoFetch(`/procto/practices/${practiceId}/reviews`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export type ProctoBooking = {
  id: string;
  patient_phone: string;
  patientPhone?: string;
  patient_name?: string | null;
  patientName?: string | null;
  patientId?: string | null;
  mode: string;
  status: string;
  channel: string;
  slot_start?: string | null;
  slotStart?: string | null;
  slot_end?: string | null;
  token_number?: number | null;
  tokenNumber?: number | null;
  session_date?: string | null;
  sessionDate?: string | null;
  notes?: string | null;
  consultationType?: string | null;
  consultation_type?: string | null;
  disease?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  practice?: { name: string; slug: string; specialty?: string | null };
  location?: { name: string; address: string; city: string };
  provider?: {
    id: string;
    name: string | null;
    email?: string | null;
    phone?: string | null;
    licenseNo?: string | null;
    description?: string | null;
    experience?: number | null;
    contactNumbers?: unknown;
  } | null;
  patient?: {
    id: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    gender: string | null;
    address: string | null;
    profession: string | null;
    dateOfBirth: string | null;
    contactNumber: string | null;
    emergencyNumber: string | null;
    imgSrc?: string | null;
  } | null;
  doctorRemarks?: string | null;
  medicines?: Array<{ name: string; amount?: string; times?: string[] }> | null;
  documents?: Array<{ name: string; url: string; uploadedAt?: string }> | null;
};

export type PracticeNotification = {
  id: string;
  type: string;
  channel: string;
  status: string;
  templateKey: string;
  recipientRole: string;
  to: string;
  title: string;
  summary: string;
  payload?: Record<string, unknown>;
  sentAt: string | null;
  createdAt: string;
  booking?: {
    id: string;
    patientPhone: string;
    patientName: string | null;
    status: string;
    slotStart: string | null;
    sessionDate: string | null;
    providerId: string;
  } | null;
};

export type PracticeNotificationsResponse = {
  total: number;
  pendingCount: number;
  failedCount: number;
  sentCount: number;
  items: PracticeNotification[];
};

export type ProctoWsEvent =
  | {
      event: "booking_created" | "booking_updated";
      booking: ProctoBooking & Record<string, unknown>;
    }
  | {
      event: "conversation_updated";
      conversation: Record<string, unknown>;
    };

/** Doctors linked to this clinic (PracticeMember), DOCTOR first; solo owner fallback. */
export function getPracticeProviders(
  members: { role: string; user: { id: string; name: string | null } }[],
) {
  const doctors = members.filter((m) => m.role === "DOCTOR").map((m) => m.user);
  if (doctors.length) return doctors;
  const owner = members.find((m) => m.role === "PRACTICE_OWNER")?.user;
  return owner ? [owner] : [];
}

export function getPracticeProvider(
  members: { role: string; user: { id: string; name: string | null } }[],
) {
  return getPracticeProviders(members)[0];
}
