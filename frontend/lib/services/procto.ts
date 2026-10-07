import { cookies } from "@/utils/cookies";
import { ensureAccessToken } from "@/lib/accessToken";

/** Same-origin in the browser — avoids localhost vs 127.0.0.1 cookie/WS splits. */
function apiBase() {
  if (typeof window !== "undefined") return "/api/v1";
  return process.env.NEXT_PUBLIC_API ?? "http://127.0.0.1:3000/api/v1";
}

let invalidateMyPracticesCacheImpl: (() => void) | null = null;

const PROCTO_FETCH_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = PROCTO_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const external = init.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else {
      external.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function proctoFetch(path: string, init?: RequestInit) {
  const token = await ensureAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(`${apiBase()}${path}`, {
      credentials: "include",
      ...init,
      headers,
    });
  } catch {
    return { status: "unsuccessful", message: "Service unavailable" };
  }

  // One retry after forced refresh on 401
  if (res.status === 401 && cookies.getCookie("refresh_token")) {
    cookies.deleteCookie("access_token");
    const retryToken = await ensureAccessToken();
    if (retryToken) {
      try {
        const retry = await fetchWithTimeout(`${apiBase()}${path}`, {
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
      } catch {
        return { status: "unsuccessful", message: "Service unavailable" };
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

  /** Emergency walk-in — no slot pick; starts now in the waiting list. */
  createWalkIn: (body: {
    practiceId: string;
    providerId: string;
    locationId?: string;
    /** Registered patient (MRN) picked from the desk search. */
    patientId: string;
    patientPhone: string;
    disease?: string;
  }) =>
    proctoFetch("/procto/bookings/walk-in", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getBooking: (id: string) => proctoFetch(`/procto/bookings/${id}`),

  /** Pre-visit payment; `refresh` asks Razorpay for the latest link state. */
  getBookingPayment: (id: string, refresh = false) =>
    proctoFetch(`/procto/bookings/${id}/payment${refresh ? "?refresh=1" : ""}`),

  listPayments: (
    practiceId: string,
    opts?: { status?: string; from?: string; to?: string; q?: string },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.status) qs.set("status", opts.status);
    if (opts?.from) qs.set("from", opts.from);
    if (opts?.to) qs.set("to", opts.to);
    if (opts?.q) qs.set("q", opts.q);
    const s = qs.toString();
    return proctoFetch(`/procto/payments/practice/${practiceId}${s ? `?${s}` : ""}`);
  },

  /** Staff custom amount → Razorpay link sent to the patient on WhatsApp. */
  createPaymentRequest: (body: {
    practiceId: string;
    bookingId?: string;
    patientId?: string;
    patientName?: string;
    patientPhone?: string;
    providerId?: string;
    amount: number;
    purpose: string;
    expiresInDays?: number;
  }) =>
    proctoFetch("/procto/payments/requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getPaymentRequest: (id: string, refresh = false) =>
    proctoFetch(`/procto/payments/requests/${id}${refresh ? "?refresh=1" : ""}`),

  resendPaymentRequest: (id: string) =>
    proctoFetch(`/procto/payments/requests/${id}/resend`, { method: "POST" }),

  cancelPaymentRequest: (id: string) =>
    proctoFetch(`/procto/payments/requests/${id}/cancel`, { method: "POST" }),

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
      const promise = proctoFetch("/procto/practices/mine")
        .then((res) => {
          if (res?.status !== "successful") {
            cached = null;
          }
          return res;
        })
        .catch((err) => {
          cached = null;
          throw err;
        });
      // Only keep a resolved successful cache; drop in-flight on next miss
      // after TTL so a hung/slow first call cannot pin the UI.
      cached = { at: now, promise };
      void promise.finally(() => {
        if (cached?.promise === promise) {
          /* keep until TTL; unsuccessful already nulled above */
        }
      });
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

  getRazorpaySettings: (practiceId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/razorpay`) as Promise<
      ProctoResult<RazorpaySettings>
    >,

  saveRazorpaySettings: (
    practiceId: string,
    body: { keyId: string; keySecret?: string; webhookSecret?: string | null },
  ) =>
    proctoFetch(`/procto/practices/${practiceId}/razorpay`, {
      method: "PUT",
      body: JSON.stringify(body),
    }) as Promise<ProctoResult<RazorpaySettings>>,

  removeRazorpaySettings: (practiceId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/razorpay`, {
      method: "DELETE",
    }) as Promise<ProctoResult<RazorpaySettings>>,

  /** Signed-in user's own photo (doctor / clinic staff). `null` removes it. */
  updateMyPhoto: async (imgSrc: string | null) => {
    const res = (await proctoFetch("/auth/me/photo", {
      method: "PUT",
      body: JSON.stringify({ imgSrc }),
    })) as ProctoResult<{ imgSrc: string | null; access_token?: string }>;
    if (res.status === "successful") {
      // The access JWT carries imgSrc; keep the browser copy in sync.
      if (res.data?.access_token) {
        cookies.setCookie("access_token", res.data.access_token, 60 * 60 * 2);
      }
      invalidateMyPracticesCacheImpl?.();
    }
    return res;
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

  /** Dry run: upcoming appointments the new schedule would no longer offer. */
  previewProviderSettings: (practiceId: string, body: Record<string, unknown>) =>
    proctoFetch(`/procto/practices/${practiceId}/provider-settings/preview`, {
      method: "POST",
      body: JSON.stringify(body),
    }) as Promise<ProctoResult<SchedulePreview>>,

  activatePendingSchedule: (practiceId: string, providerId: string, effectiveFrom?: string) =>
    proctoFetch(`/procto/practices/${practiceId}/schedules/pending/activate`, {
      method: "POST",
      body: JSON.stringify({ providerId, effectiveFrom }),
    }),

  discardPendingSchedule: (practiceId: string, providerId: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/schedules/pending?providerId=${encodeURIComponent(providerId)}`,
      { method: "DELETE" },
    ),

  /** Clashing visits with auto-matched slots, free doctors, and alert options (read-only). */
  getScheduleResolution: (practiceId: string, providerId: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/schedules/pending/resolution?providerId=${encodeURIComponent(providerId)}`,
    ) as Promise<ProctoResult<ScheduleResolutionPlan>>,

  resolveScheduleConflicts: (
    practiceId: string,
    providerId: string,
    actions: ScheduleResolutionAction[],
    dryRun = false,
  ) =>
    proctoFetch(`/procto/practices/${practiceId}/schedules/pending/resolve`, {
      method: "POST",
      body: JSON.stringify({ providerId, actions, dryRun }),
    }) as Promise<ProctoResult<ScheduleResolutionOutcome>>,

  sendHeldScheduleAlerts: (practiceId: string, providerId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/schedules/pending/alerts/send`, {
      method: "POST",
      body: JSON.stringify({ providerId }),
    }) as Promise<
      ProctoResult<{ sent: number; skipped: number; pendingVerification: PendingScheduleVerification | null }>
    >,

  cancelUpcomingSchedule: (practiceId: string, providerId: string, effectiveFrom: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/schedules/upcoming?providerId=${encodeURIComponent(providerId)}&effectiveFrom=${encodeURIComponent(effectiveFrom)}`,
      { method: "DELETE" },
    ),

  getOverrides: (practiceId: string, providerId?: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/overrides${providerId ? `?providerId=${providerId}` : ""}`,
    ),

  createOverride: (practiceId: string, body: Record<string, unknown>) =>
    proctoFetch(`/procto/practices/${practiceId}/overrides`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Quick-create bookable time from the calendar (no patient is messaged). */
  addExtraSlots: (practiceId: string, body: ExtraSlotsRequest) =>
    proctoFetch(`/procto/practices/${practiceId}/overrides`, {
      method: "POST",
      body: JSON.stringify({ ...body, type: "EXTRA_SLOT" }),
    }) as Promise<ProctoResult<ExtraSlotsResult | ExtraSlotsNeedsConfirmation>>,

  searchDeskPatients: (practiceId: string, q: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/desk-patients?q=${encodeURIComponent(q)}`,
    ) as Promise<ProctoResult<{ patients: DeskPatient[] }>>,

  registerDeskPatient: (practiceId: string, body: DeskPatientRegistration) =>
    proctoFetch(`/procto/practices/${practiceId}/desk-patients`, {
      method: "POST",
      body: JSON.stringify(body),
    }) as Promise<ProctoResult<DeskPatient>>,

  /** Add a patient registered elsewhere on GlucoGuide to this clinic's patient list. */
  linkDeskPatient: (practiceId: string, patientId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/desk-patients/${patientId}/link`, {
      method: "POST",
    }) as Promise<ProctoResult<DeskPatient>>,

  getAuditLog: (
    practiceId: string,
    q: { action?: string; providerId?: string; from?: string; to?: string; before?: string; limit?: number } = {},
  ) => {
    const qs = new URLSearchParams(
      Object.entries(q)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return proctoFetch(`/procto/practices/${practiceId}/audit${qs ? `?${qs}` : ""}`) as Promise<
      ProctoResult<AuditLogPage>
    >;
  },

  getMyPracticePermissions: (practiceId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/permissions`) as Promise<
      ProctoResult<MyPracticePermissions>
    >,

  /** Days a repeat would add / skip, without saving. */
  previewExtraSlots: (practiceId: string, body: ExtraSlotsRequest) =>
    proctoFetch(`/procto/practices/${practiceId}/overrides`, {
      method: "POST",
      body: JSON.stringify({ ...body, type: "EXTRA_SLOT", dryRun: true }),
    }) as Promise<ProctoResult<ExtraSlotsPlan>>,

  /** `series` removes every upcoming day of a repeat that has no booked visit. */
  removeExtraSlots: (
    practiceId: string,
    overrideId: string,
    scope: "one" | "series" = "one",
  ) =>
    proctoFetch(
      `/procto/practices/${practiceId}/overrides/${overrideId}${scope === "series" ? "?scope=series" : ""}`,
      { method: "DELETE" },
    ) as Promise<ProctoResult<{ removed: boolean; message: string }>>,

  /** Lifts a block / leave / token limit, or removes one day of extra slots. */
  removeOverride: (practiceId: string, overrideId: string) =>
    proctoFetch(`/procto/practices/${practiceId}/overrides/${overrideId}`, {
      method: "DELETE",
    }) as Promise<ProctoResult<{ removed: boolean; message: string }>>,

  getCalendarDay: (practiceId: string, providerId: string, date: string) =>
    proctoFetch(
      `/procto/practices/${practiceId}/calendar?providerId=${providerId}&date=${date}`,
    ) as Promise<ProctoResult<CalendarDay>>,

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
      clinicalAssessment?: unknown;
      status?: string;
    },
  ) =>
    proctoFetch(`/procto/bookings/${bookingId}/visit`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getGeneralDocuments: (bookingId: string) =>
    proctoFetch(`/procto/bookings/${bookingId}/general-documents`),

  addGeneralDocument: (
    bookingId: string,
    doc: { name: string; url: string },
  ) =>
    proctoFetch(`/procto/bookings/${bookingId}/general-documents`, {
      method: "POST",
      body: JSON.stringify(doc),
    }),

  /** Save on the appointment, post in care chat, and send on patient WhatsApp. */
  shareBookingDocument: (
    bookingId: string,
    doc: { name: string; url: string; caption?: string },
  ) =>
    proctoFetch(`/procto/bookings/${bookingId}/share-document`, {
      method: "POST",
      body: JSON.stringify(doc),
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
    opts?: { status?: string; kind?: string; take?: number; skip?: number },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.status) qs.set("status", opts.status);
    if (opts?.kind) qs.set("kind", opts.kind);
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
  arrivedAt?: string | null;
  arrived_at?: string | null;
  paymentStatus?: string | null;
  payment_status?: string | null;
  paymentAmount?: number | null;
  payment_amount?: number | null;
  paidAt?: string | null;
  paid_at?: string | null;
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
    age?: number | null;
    mrn?: string | null;
  } | null;
  doctorRemarks?: string | null;
  medicines?: Array<{ name: string; amount?: string; times?: string[] }> | null;
  documents?: Array<{ name: string; url: string; uploadedAt?: string }> | null;
  clinicalAssessment?: unknown;
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
    }
  | {
      event: "notification_created";
      notification: Record<string, unknown>;
    }
  | { event: "payment_updated"; payment: PaymentRequestRow }
  | { event: "calendar_updated"; providerId: string; dates: string[] };

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

export type RazorpaySettings = {
  connected: boolean;
  keyId: string | null;
  mode: "LIVE" | "TEST" | null;
  secretLast4: string | null;
  hasWebhookSecret: boolean;
  verifiedAt: string | null;
  webhookUrl: string;
  /** No clinic keys, but the platform account collects payments. */
  platformFallback: boolean;
};

type ProctoResult<T> = { status: string; message?: string; data?: T };

export type ScheduleConflictCode =
  | "MODE_CHANGED"
  | "DAY_OFF"
  | "OUTSIDE_HOURS"
  | "IN_BREAK"
  | "OFF_GRID"
  | "OVER_CAPACITY";

export type ScheduleConflict = {
  bookingId: string;
  patientName: string | null;
  day: string;
  when: string;
  startsAt?: string;
  code: ScheduleConflictCode;
  reason: string;
};

/** Lead-time rule: a change may not affect booked visits inside the clinic's notice period. */
export type TimeWindow = { start: string; end: string };

/** A doctor's day for the calendar grid (all times HH:MM clinic wall clock). */
export type ExtraWindow = TimeWindow & {
  id: string;
  note: string | null;
  slotIntervalMin: number;
  /** Patients per slot (1 = normal, more = shared queue slot). */
  capacity: number;
  seriesId: string | null;
  createdBy: string | null;
  createdAt: string | null;
  /** Staff member who added it (name + clinic role); null for older rows. */
  addedBy?: { name: string; role: string | null } | null;
};

export type DayWindows = {
  /** Clinic weekday, 0 = Sunday. */
  weekday: number;
  hours: TimeWindow[];
  /** The doctor's break inside regular hours. */
  breaks: TimeWindow[];
  extra: ExtraWindow[];
  blocked: Array<TimeWindow & { type: string; reason: string | null }>;
  dayOff: { type: string; reason: string | null } | null;
  mode: "TIME_BASED" | "TOKEN_BASED" | null;
  slotIntervalMin: number;
};

export type CalendarDay = {
  date: string;
  timeSlots: Array<{
    start: string;
    end: string;
    booked: number;
    capacity: number;
    available: boolean;
  }>;
  configuredMode: "TIME_BASED" | "TOKEN_BASED" | null;
  windows?: DayWindows;
};

export type ExtraSlotsRequest = {
  providerId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string;
  /** Omit for the doctor's own slot length. */
  slotIntervalMin?: number;
  capacity?: number;
  /** "Extend · repeat": these weekdays (0 = Sun) from `date` until `until`. */
  repeat?: { weekdays: number[]; until: string };
  /** Create even though the window runs into a break, blocked time, leave or an off-duty day. */
  confirm?: boolean;
};

/** Non-blocking conflict the user can confirm past. */
export type SlotWarning = {
  code: "leave" | "offDay" | "break" | "blocked";
  message: string;
  detail: string;
};

export type ExtraSlotsPlan = {
  dates: Array<{ date: string; slots: number; slotIntervalMin: number; warnings: SlotWarning[] }>;
  skipped: Array<{ date: string; reason: string; error: string }>;
  message: string;
};

/** Nothing saved yet: repeat the request with `confirm: true` to create anyway. */
export type ExtraSlotsNeedsConfirmation = ExtraSlotsPlan & {
  needsConfirmation: true;
  warnings: Array<SlotWarning & { date: string }>;
};

export type PracticePermissionScope = "ANY" | "OWN" | null;

/** Patient found or registered at the front desk. */
export type DeskPatient = {
  patientId: string;
  name: string;
  mrn: string | null;
  phone: string;
  gender: string | null;
  dateOfBirth: string | null;
  age: number | null;
  relationship: string | null;
  /** Visited / registered at this clinic before. */
  knownHere: boolean;
  lastVisitAt: string | null;
  /** Register matched a patient already on GlucoGuide; added to this clinic with their existing MRN. */
  existingPatient?: boolean;
};

export type DeskPatientRegistration = {
  name: string;
  phone: string;
  gender: "male" | "female" | "others";
  /** YYYY-MM-DD */
  dateOfBirth: string;
  email?: string;
  relationship?: string;
};

export type AuditAction =
  | "SLOT_CREATED"
  | "SLOT_REMOVED"
  | "OVERRIDE_CREATED"
  | "OVERRIDE_REMOVED"
  | "WALK_IN_ADDED"
  | "PATIENT_REGISTERED";

export type AuditEvent = {
  id: string;
  action: AuditAction;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  entityType: string | null;
  entityId: string | null;
  providerId: string | null;
  summary: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditLogPage = {
  scope: "ANY" | "OWN";
  events: AuditEvent[];
  nextBefore: string | null;
};

export type MyPracticePermissions = {
  userId: string;
  role: string;
  permissions: {
    MANAGE_SLOTS_INLINE: PracticePermissionScope;
    VIEW_AUDIT_LOG: PracticePermissionScope;
  };
};

export type ExtraSlotsResult = ExtraSlotsPlan & {
  id: string;
  ids: string[];
  seriesId: string | null;
  startTime: string;
  endTime: string;
  slots: number;
  slotIntervalMin: number;
  capacity: number;
  created: number;
};

export type ScheduleNotice = {
  hours: number;
  endsAt: string;
  requestedFrom: string;
  /** The start date was moved later to protect visits inside the notice period. */
  adjusted: boolean;
  blockedBy: ScheduleConflict[];
};

export type ScheduleImpact = {
  total: number;
  days: number;
  firstDay: string | null;
  lastDay: string | null;
  byCode: Partial<Record<ScheduleConflictCode, number>>;
};

export type SchedulePreview = {
  effectiveFrom: string;
  minEffectiveFrom: string;
  modeChanging: boolean;
  conflicts: ScheduleConflict[];
  impact?: ScheduleImpact;
  wouldBePending?: boolean;
  safeEffectiveFrom: string;
  notice?: ScheduleNotice;
};

/** A saved schedule that clashes with booked visits; not used for booking until activated. */
export type PendingScheduleVerification = {
  status: "PENDING_VERIFICATION";
  effectiveFrom: string;
  requestedFrom: string;
  minEffectiveFrom: string;
  locationId: string;
  summary: UpcomingScheduleChange;
  submittedAt: string;
  submittedBy: string | null;
  modeChanging: boolean;
  conflicts: ScheduleConflict[];
  impact: ScheduleImpact;
  safeEffectiveFrom: string;
  notice?: ScheduleNotice;
  /** Patient alerts from resolved visits, sent once every clash is resolved. */
  heldAlerts?: number;
};

export type ScheduleSlotSuggestion = {
  mode: "TIME_BASED" | "TOKEN_BASED";
  day: string;
  slotStart?: string;
  sessionDate?: string;
  label: string;
};

export type ScheduleResolutionItem = ScheduleConflict & {
  mode: "TIME_BASED" | "TOKEN_BASED" | null;
  autoMatch: ScheduleSlotSuggestion | null;
  suggestions: ScheduleSlotSuggestion[];
  reassignTo: Array<{ providerId: string; name: string }>;
  hasEmail: boolean;
};

export type ScheduleResolutionPlan = {
  effectiveFrom: string;
  summary: UpcomingScheduleChange;
  impact: ScheduleImpact;
  canReassign: boolean;
  emailEnabled: boolean;
  noticeHours?: number;
  heldAlerts?: number;
  items: ScheduleResolutionItem[];
};

export type ScheduleResolutionActionType = "RESCHEDULE" | "REASSIGN" | "CANCEL" | "KEEP";

export type ScheduleResolutionAction = {
  bookingId: string;
  type: ScheduleResolutionActionType;
  slotStart?: string;
  sessionDate?: string;
  toProviderId?: string;
  reason?: string;
  note?: string;
  notifyWhatsApp?: boolean;
  notifyEmail?: boolean;
};

export type ScheduleAlertStatus = "queued" | "held" | "off" | "no_email" | "not_configured" | "n/a";

export type ScheduleResolutionOutcome = {
  dryRun: boolean;
  ok: number;
  failed: number;
  alertsReleased?: number;
  results: Array<{
    bookingId: string;
    type: ScheduleResolutionActionType;
    ok: boolean;
    message: string;
    whatsapp: ScheduleAlertStatus;
    email: ScheduleAlertStatus;
  }>;
  pendingVerification: PendingScheduleVerification | null;
};

/** A saved schedule version that starts after today. */
export type UpcomingScheduleChange = {
  effectiveFrom: string;
  mode: "TIME_BASED" | "TOKEN_BASED" | null;
  workingDays: number[];
  startTime: string | null;
  endTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  slotIntervalMin: number | null;
  maxPerSlot: number | null;
  locationId?: string;
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
