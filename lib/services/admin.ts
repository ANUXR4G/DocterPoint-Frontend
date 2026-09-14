type AdminResponse<T = unknown> = {
  status: string
  message?: string
  data?: T
}

export async function adminFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<AdminResponse<T>> {
  const res = await fetch(`/api/v1/procto/admin${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers as object) },
    ...init,
  })
  const text = await res.text()
  try {
    return JSON.parse(text) as AdminResponse<T>
  } catch {
    return { status: "unsuccessful", message: "Invalid response" }
  }
}

export type AdminOverview = {
  patients: number
  doctors: number
  practices: number
  activePractices: number
  bookings: number
  subscriptions: number
  escalations: number
  pendingTemplates: number
  pendingReviews: number
  waNumbers: number
  subscriptionBreakdown: Array<{ status: string; count: number }>
}

export type AdminAnalytics = {
  months?: number
  dailyMonthOffset?: number
  dailyMonthLabel?: string
  mrr: number
  revenueThisMonth: number
  revenueLastMonth: number
  revenueChangePercent: number
  bookingsThisMonth: number
  bookingsLastMonth: number
  bookingsChangePercent: number
  activeSubscriptions: number
  newSubscriptionsThisMonth: number
  monthlyTrend: Array<{
    label: string
    revenue: number
    newSubscriptions: number
    bookings: number
    patients: number
    practices: number
  }>
  dailyBookings: Array<{ day: number; count: number }>
  subscriptionBreakdown: Array<{ status: string; count: number }>
  comparison: {
    revenue: { thisMonth: number; lastMonth: number }
    bookings: { thisMonth: number; lastMonth: number }
  }
}

export type AdminPatient = {
  id: string
  email: string
  name: string | null
  phone: string | null
  gender?: string | null
  createdAt: string
  contactNumber: string | null
  dateOfBirth: string | null
  hasId: boolean
}

export type AdminDoctor = {
  id: string
  userId: string
  role: string
  isActive: boolean
  email: string
  name: string | null
  phone: string | null
  practice: { id: string; name: string; slug: string; isActive: boolean }
  createdAt: string
}

export type AdminPractice = {
  id: string
  name: string
  slug: string
  type: string
  specialty: string | null
  email: string | null
  phone: string | null
  isActive: boolean
  isDirectoryListed: boolean
  registrationNo: string | null
  createdAt: string
  memberCount: number
  bookingCount: number
  locationCount: number
  subscription: {
    id: string
    status: string
    planName: string
    gracePeriodEnd: string | null
    currentPeriodEnd?: string | null
  } | null
  whatsapp: { id: string; phoneNumber: string; status: string } | null
}

export type AdminBooking = {
  id: string
  status: string
  mode: string
  channel: string
  patientPhone: string
  patientName: string | null
  slotStart: string | null
  tokenNumber: number | null
  sessionDate: string | null
  createdAt: string
  practice: { id: string; name: string; slug: string }
  location: { name: string; city: string }
}

export type AdminReview = {
  id: string
  authorName: string
  authorPhone: string | null
  rating: number
  body: string | null
  isPublished: boolean
  createdAt: string
  practice: { id: string; name: string; slug: string }
}

export type AdminTemplate = {
  id: string
  name: string
  status: string
  category: string
  body: string
  language: string
  updatedAt: string
  practice?: { id: string; name: string; slug: string } | null
}

export type AdminEscalation = {
  id: string
  patientPhone: string
  status: string
  updatedAt: string
  practice: { id: string; name: string; slug: string }
}

export type AdminHelpMessage = {
  id: string
  sender_id: string
  content: string
  type: "help" | "reply" | string
  is_seen?: boolean
  created_at: string
}

export type AdminHelpThread = {
  userId: string
  unreadCount: number
  messageCount: number
  user: {
    id: string
    name: string | null
    email: string
    role: string
  } | null
  latestMessage: AdminHelpMessage | null
}

export type AdminNotificationEvent = {
  id: string
  type: string
  channel: string
  status: string
  payload: unknown
  sentAt: string | null
  createdAt: string
  practice: { id: string; name: string; slug: string } | null
  booking: {
    id: string
    patientPhone: string
    status: string
    slotStart: string | null
    sessionDate: string | null
  } | null
}

export type AdminPendingNumber = {
  id: string
  phoneNumber: string
  status: string
  displayName: string | null
  updatedAt: string
  practice?: { id: string; name: string; slug: string } | null
}

export type AdminWhatsAppOverview = {
  counts: {
    active: number
    available: number
    provisioning: number
    suspended?: number
    subscribedWithoutLine: number
  }
  activeNumbers: Array<{
    id: string
    phoneNumber: string
    displayName: string | null
    status: string
    wabaId?: string | null
    wabaPhoneNumberId?: string | null
    templatesStatus?: string | null
    activatedAt: string | null
    practice: {
      id: string
      name: string
      slug: string
      subscription: { status: string; planName: string } | null
    } | null
  }>
  availableNumbers: Array<{
    id: string
    phoneNumber: string
    displayName: string | null
    status: string
    createdAt: string
  }>
  provisioningNumbers: Array<{
    id: string
    phoneNumber: string
    displayName: string | null
    status: string
    wabaId?: string | null
    wabaPhoneNumberId?: string | null
    templatesStatus?: string | null
    updatedAt: string
    practice: { id: string; name: string; slug: string } | null
  }>
  suspendedNumbers?: Array<{
    id: string
    phoneNumber: string
    displayName: string | null
    status: string
    updatedAt: string
    practice: { id: string; name: string; slug: string } | null
  }>
  subscribedWithoutLine: Array<{
    id: string
    name: string
    slug: string
    subscription: { id: string; status: string; planName: string } | null
  }>
}

export type WhatsAppSignupConfig = {
  appId: string | null
  configId: string | null
  apiVersion: string
  embeddedSignupEnabled: boolean
  autoResolveEnabled: boolean
  coexistenceFlow: boolean
  platformReady: boolean
  checklist: Record<string, boolean>
  webhookPath: string
  clinicConnectPath: string
  clinicSignupHint: string
}

export type WhatsAppRegistry = {
  total: number
  summary: {
    connected: number
    live: number
    provisioning: number
    available: number
    suspended: number
    withWaba: number
  }
  signup: WhatsAppSignupConfig
  numbers: Array<{
    id: string
    phoneNumber: string
    displayName: string | null
    status: string
    provider: string
    wabaId: string | null
    wabaPhoneNumberId: string | null
    templatesStatus: string | null
    displayNameStatus: string | null
    verificationStatus: string | null
    activatedAt: string | null
    createdAt: string
    updatedAt: string
    notes: string | null
    waMeLink: string | null
    practice: {
      id: string
      name: string
      slug: string
      planName: string | null
      subscriptionStatus: string | null
      connectUrl: string
    } | null
  }>
}

export type WhatsAppPendingSignups = {
  signup: WhatsAppSignupConfig
  total: number
  clinics: Array<{
    id: string
    name: string
    slug: string
    phone: string | null
    planName: string | null
    subscriptionStatus: string | null
    owners: Array<{ name: string | null; email: string | null; phone: string | null }>
    connectUrl: string
    inviteMessage: string
  }>
}

export const adminService = {
  overview: () => adminFetch<AdminOverview>("/overview"),
  analytics: (opts?: { months?: number; dailyMonthOffset?: number }) => {
    const qs = new URLSearchParams()
    if (opts?.months) qs.set("months", String(opts.months))
    if (opts?.dailyMonthOffset != null) {
      qs.set("dailyMonthOffset", String(opts.dailyMonthOffset))
    }
    const q = qs.toString()
    return adminFetch<AdminAnalytics>(`/analytics${q ? `?${q}` : ""}`)
  },
  patients: (q?: string) =>
    adminFetch<{ total: number; items: AdminPatient[] }>(
      `/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  doctors: (q?: string) =>
    adminFetch<{ total: number; items: AdminDoctor[] }>(
      `/doctors${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  practices: (q?: string) =>
    adminFetch<{ total: number; items: AdminPractice[] }>(
      `/practices${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  updatePractice: (id: string, body: Record<string, boolean>) =>
    adminFetch(`/practices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  bookings: (q?: string, status?: string) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (status) params.set("status", status)
    const qs = params.toString()
    return adminFetch<{ total: number; items: AdminBooking[] }>(
      `/bookings${qs ? `?${qs}` : ""}`,
    )
  },
  approvals: () => adminFetch("/approvals"),
  reviews: (published?: boolean) => {
    const params = new URLSearchParams()
    if (published !== undefined) params.set("published", String(published))
    const qs = params.toString()
    return adminFetch<{ total: number; items: AdminReview[] }>(
      `/reviews${qs ? `?${qs}` : ""}`,
    )
  },
  pendingTemplates: () =>
    adminFetch<{ total: number; items: AdminTemplate[] }>("/pending-templates"),
  pendingNumbers: () =>
    adminFetch<{ total: number; items: AdminPendingNumber[] }>("/pending-numbers"),
  approveReview: (id: string) =>
    adminFetch(`/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isPublished: true }),
    }),
  rejectReview: (id: string) =>
    adminFetch(`/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isPublished: false }),
    }),
  approveTemplate: (id: string) =>
    adminFetch(`/templates/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "APPROVED" }),
    }),
  rejectTemplate: (id: string) =>
    adminFetch(`/templates/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "REJECTED" }),
    }),
  resolveEscalation: (id: string, status: "bot_active" | "closed") =>
    adminFetch(`/escalations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  advanceNumberStatus: (id: string, status: string) =>
    adminFetch(`/numbers/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  setMemberActive: (id: string, isActive: boolean) =>
    adminFetch(`/members/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  subscriptions: () => adminFetch("/subscriptions"),
  plans: () =>
    adminFetch<
      Array<{
        id: string
        name: string
        priceMonthlyInr: number
        isActive: boolean
      }>
    >("/plans"),
  startTrial: (body: {
    practiceId: string
    planId: string
    /** Omit or leave empty for open-ended trial */
    trialDays?: number | null
  }) =>
    adminFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        practiceId: body.practiceId,
        planId: body.planId,
        mode: "trial",
        ...(body.trialDays != null && body.trialDays > 0
          ? { trialDays: body.trialDays }
          : { trialDays: null }),
      }),
    }),
  startSubscription: (practiceId: string, planId: string) =>
    adminFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({ practiceId, planId, mode: "active" }),
    }),
  simulateBilling: (practiceId: string, action: string) =>
    adminFetch("/billing/simulate", {
      method: "POST",
      body: JSON.stringify({ practiceId, action }),
    }),
  notifyGoLive: (practiceId: string) =>
    adminFetch(`/numbers/${practiceId}/go-live`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  syncMetaTemplates: () =>
    adminFetch("/templates/sync-meta", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  numbers: () => adminFetch("/numbers"),
  whatsappOverview: () => adminFetch<AdminWhatsAppOverview>("/numbers/overview"),
  whatsappSignupConfig: () =>
    adminFetch<WhatsAppSignupConfig>("/whatsapp/signup/config"),
  whatsappRegistry: (opts?: { status?: string; q?: string }) => {
    const params = new URLSearchParams()
    if (opts?.status) params.set("status", opts.status)
    if (opts?.q) params.set("q", opts.q)
    const qs = params.toString()
    return adminFetch<WhatsAppRegistry>(
      `/whatsapp/registry${qs ? `?${qs}` : ""}`,
    )
  },
  whatsappPendingSignups: () =>
    adminFetch<WhatsAppPendingSignups>("/whatsapp/pending-signups"),
  whatsappConnectPractice: (
    practiceId: string,
    body: {
      phoneNumber: string
      wabaPhoneNumberId?: string
      wabaId?: string
      oauthCode?: string
    },
  ) =>
    adminFetch(`/whatsapp/practices/${practiceId}/connect`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  whatsappRefreshNumber: (id: string) =>
    adminFetch(`/whatsapp/numbers/${id}/refresh`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  whatsappRefreshAll: () =>
    adminFetch("/whatsapp/provision/refresh-all", {
      method: "POST",
      body: JSON.stringify({ limit: 50 }),
    }),
  escalations: () =>
    adminFetch<{ total: number; items: AdminEscalation[] }>("/escalations"),
  templates: () => adminFetch("/templates"),
  supportHelpThreads: () =>
    adminFetch<{ threads: AdminHelpThread[]; totalUnread: number }>(
      "/support/help-threads",
    ),
  supportHelpThread: (userId: string, page = 1) =>
    adminFetch<{
      userId: string
      total: number
      messages: AdminHelpMessage[]
    }>(`/support/help-threads/${userId}?page=${page}&limit=50`),
  supportMarkThreadSeen: (userId: string) =>
    adminFetch(`/support/help-threads/${userId}/seen`, { method: "PATCH" }),
  supportReply: (userId: string, content: string) =>
    adminFetch(`/support/help-threads/${userId}/reply`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  supportNotifications: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ""
    return adminFetch<{
      total: number
      pendingCount: number
      failedCount: number
      items: AdminNotificationEvent[]
    }>(`/support/notifications${qs}`)
  },
}
