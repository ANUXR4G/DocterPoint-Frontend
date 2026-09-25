"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { proctoService, type ProctoBooking } from "@/lib/services/procto";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import {
  filterBookingsByDate,
  usePracticeDashboard,
} from "@/contexts/PracticeDashboardContext";

import {
  DOCTOR_SUBSCRIPTION_HREF,
  PRACTICE_TAB_LABELS,
  legacyPracticeTabHref,
  practiceTabHref,
  type PracticeTab,
} from "@/lib/doctorPracticeTabs";
import { formatPracticeTime } from "@/lib/practiceTime";

type Tab = PracticeTab;

type PracticeMember = {
  practice: {
    id: string;
    name: string;
    slug: string;
    locations: { id: string; name: string; city: string }[];
    members: {
      userId: string;
      role: string;
      user: {
        id: string;
        name: string | null;
        email?: string | null;
        phone?: string | null;
        doctor?: {
          licenseNo: string | null;
          appointmentValidityDays: number;
          description?: string | null;
        } | null;
      };
    }[];
  };
  userId: string;
  role: string;
};

type CalendarData = {
  date: string;
  bookings: Array<{
    id: string;
    patientPhone: string;
    patientName: string | null;
    mode: string;
    status: string;
    channel: string;
    slotStart: string | null;
    tokenNumber: number | null;
    sessionDate: string | null;
  }>;
  timeSlots: Array<{
    start: string;
    end: string;
    booked: number;
    capacity: number;
    available: boolean;
  }>;
  tokenSessions: Array<{
    sessionStart: string;
    sessionEnd: string;
    issued: number;
    capacity: number;
    nextToken: number;
    available: boolean;
  }>;
  overrides: Array<{ id: string; type: string; reason: string | null; date: string }>;
  configuredMode?: "TIME_BASED" | "TOKEN_BASED" | null;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;
const OVERRIDE_TYPES = ["BLOCK_DAY", "BLOCK_SLOT", "EMERGENCY_LEAVE", "TOKEN_LIMIT_ADJUST"];
const EXTRA_SLOT_TYPE = "EXTRA_SLOT";

type ScheduleRow = {
  dayOfWeek: number;
  mode: string;
  startTime?: string | null;
  endTime?: string | null;
  sessionStart?: string | null;
  sessionEnd?: string | null;
  slotIntervalMin?: number | null;
  maxPerSlot?: number;
  maxTokens?: number | null;
  breakStartTime?: string | null;
  breakEndTime?: string | null;
};


export function PracticeManagementPanel({ embedded = false }: { embedded?: boolean }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm opacity-70">Loading practice…</p>}>
      <ProviderPracticePageInner embedded={embedded} />
    </Suspense>
  );
}

function ProviderPracticePageInner({ embedded = false }: { embedded?: boolean }) {
  const {
    memberships: ctxMemberships,
    bookings: ctxBookings,
    ready: dashReady,
    loading: dashLoading,
    refresh: refreshDashboard,
  } = usePracticeDashboard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = embedded
    ? searchParams.get("subtab")
    : searchParams.get("tab");
  const doctorParam = searchParams.get("doctor");
  const subscribePlan = searchParams.get("subscribePlan");

  useEffect(() => {
    if (embedded || tabParam !== "billing") return;
    const qs = subscribePlan
      ? `?subscribePlan=${encodeURIComponent(subscribePlan)}`
      : "";
    router.replace(`${DOCTOR_SUBSCRIPTION_HREF}${qs}`);
  }, [embedded, tabParam, subscribePlan, router]);

  // Patients is a standalone page — never a Settings practice tab.
  useEffect(() => {
    if (tabParam === "patients") {
      router.replace("/doctor/patients");
    }
  }, [tabParam, router]);

  const initialTab: Tab =
    tabParam === "calendar" ||
    tabParam === "setup" ||
    tabParam === "schedule" ||
    tabParam === "overrides" ||
    tabParam === "doctors" ||
    tabParam === "inbox"
      ? tabParam === "schedule" || tabParam === "overrides"
        ? "setup"
        : (tabParam as Tab)
      : "calendar";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [setupPane, setSetupPane] = useState<"hours" | "blocks">(
    tabParam === "overrides" ? "blocks" : "hours",
  );

  useEffect(() => {
    if (
      tabParam === "calendar" ||
      tabParam === "setup" ||
      tabParam === "doctors" ||
      tabParam === "inbox"
    ) {
      setTab(tabParam);
    } else if (tabParam === "schedule") {
      setTab("setup");
      setSetupPane("hours");
    } else if (tabParam === "overrides") {
      setTab("setup");
      setSetupPane("blocks");
    }
  }, [tabParam]);

  const [memberships, setMemberships] = useState<PracticeMember[]>([]);
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [schedules, setSchedules] = useState<unknown[]>([]);
  const [overrides, setOverrides] = useState<unknown[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const membership = memberships[practiceIdx];
  const practice = membership?.practice;
  const locationId = practice?.locations[0]?.id;
  const isClinicAdmin =
    membership?.role === "PRACTICE_OWNER" ||
    membership?.role === "PRACTICE_ADMIN";

  const rosterDoctors = useMemo(() => {
    if (!practice) return [];
    return practice.members.filter(
      (m) =>
        m.role === "DOCTOR" ||
        (m.role === "PRACTICE_OWNER" && m.user.doctor),
    );
  }, [practice]);

  const providerId =
    selectedProviderId ||
    rosterDoctors[0]?.userId ||
    membership?.userId ||
    null;

  const practiceTabUrl = useCallback(
    (t: Tab, doctorId?: string | null) => {
      const id = doctorId ?? providerId;
      if (embedded) {
        return practiceTabHref(t, id ? { doctorId: id } : undefined);
      }
      const doctorQs = id ? `&doctor=${encodeURIComponent(id)}` : "";
      return `/doctor/practice?tab=${t}${doctorQs}`;
    },
    [embedded, providerId],
  );

  const reloadMemberships = useCallback(async () => {
    await refreshDashboard({ silent: true });
  }, [refreshDashboard]);

  const loadCalendar = useCallback(async () => {
    if (!practice || !providerId) return;
    const res = await proctoService.getCalendar(practice.id, providerId, date);
    if (res.status === "successful") setCalendar(res.data);
  }, [practice, providerId, date]);

  const loadSchedules = useCallback(async () => {
    if (!practice || !providerId) return;
    const res = await proctoService.getSchedules(practice.id, providerId);
    if (res.status === "successful") setSchedules(res.data);
  }, [practice, providerId]);

  const loadOverrides = useCallback(async () => {
    if (!practice || !providerId) return;
    const res = await proctoService.getOverrides(practice.id, providerId);
    if (res.status === "successful") setOverrides(res.data);
  }, [practice, providerId]);

  useEffect(() => {
    if (!dashReady) return;
    if (ctxMemberships.length) {
      setMemberships(ctxMemberships as PracticeMember[]);
    }
    setLoading(false);
  }, [dashReady, ctxMemberships]);

  useEffect(() => {
    if (!practice) return;
    const fromQuery =
      doctorParam &&
      practice.members.some((m) => m.userId === doctorParam)
        ? doctorParam
        : null;
    const preferred =
      fromQuery ??
      practice.members.find((m) => m.role === "DOCTOR")?.userId ??
      practice.members.find((m) => m.role === "PRACTICE_OWNER")?.userId ??
      membership?.userId ??
      null;
    setSelectedProviderId((prev) => {
      if (!isClinicAdmin) {
        return membership?.userId ?? preferred;
      }
      if (fromQuery) return fromQuery;
      if (prev && practice.members.some((m) => m.userId === prev)) return prev;
      return preferred;
    });
  }, [practice, membership?.userId, isClinicAdmin, doctorParam]);

  useEffect(() => {
    if (!practice || !providerId) return;
    if (tab === "calendar") void loadCalendar();
    if (tab === "setup") {
      void loadSchedules();
      void loadOverrides();
    }
  }, [tab, practice, providerId, date, loadCalendar, loadSchedules, loadOverrides]);

  useEffect(() => {
    if (tab !== "calendar" || !practice || !providerId) return;
    const dayBookings = filterBookingsByDate(ctxBookings, date);
    setCalendar((prev) => {
      if (!prev || prev.date !== date) return prev;
      let bookings = [...prev.bookings];
      for (const raw of dayBookings) {
        const pid =
          (raw as ProctoBooking & { providerId?: string }).providerId ??
          raw.provider?.id;
        if (pid && pid !== providerId) continue;
        const normalized = {
          id: raw.id,
          patientPhone:
            raw.patientPhone ??
            (raw as { patient_phone?: string }).patient_phone ??
            "",
          patientName:
            raw.patientName ??
            (raw as { patient_name?: string | null }).patient_name ??
            null,
          mode: raw.mode,
          status: raw.status,
          channel: raw.channel,
          slotStart:
            raw.slotStart ??
            (raw as { slot_start?: string | null }).slot_start ??
            null,
          tokenNumber:
            raw.tokenNumber ??
            (raw as { token_number?: number | null }).token_number ??
            null,
          sessionDate:
            raw.sessionDate ??
            (raw as { session_date?: string | null }).session_date ??
            null,
        };
        const idx = bookings.findIndex((b) => b.id === normalized.id);
        if (idx >= 0) {
          bookings[idx] = { ...bookings[idx], ...normalized };
        } else {
          bookings.push(normalized);
        }
      }
      return { ...prev, bookings };
    });
  }, [ctxBookings, date, providerId, tab, practice]);

  if (loading || (!dashReady && dashLoading)) {
    return <p className="p-6 text-sm opacity-70">Loading practice dashboard…</p>;
  }

  if (!memberships.length) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center">
        <h1 className="text-xl font-bold mb-2">No practice linked</h1>
        <p className="text-sm opacity-75 mb-4">
          Run the demo seed or onboard a practice to use the provider dashboard.
        </p>
        <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">
          cd backend && npm run db:push && npm run seed
        </code>
      </div>
    );
  }

  return (
    <div className={embedded ? "pb-4" : "dashboard-page-wide pb-10"}>
      {!embedded ? (
        <DashboardPageHeader
          eyebrow="Practice"
          title={practice?.name || "Practice"}
          subtitle="Schedule, team, and WhatsApp inbox"
          action={
            <div className="flex flex-wrap items-center gap-2">
              {isClinicAdmin &&
                rosterDoctors.length >= 1 &&
                (tab === "calendar" || tab === "setup") && (
                  <select
                    value={providerId ?? ""}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSelectedProviderId(next);
                      router.replace(practiceTabUrl(tab, next), {
                        scroll: false,
                      });
                    }}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-800"
                    aria-label="Select doctor to override"
                  >
                    {rosterDoctors.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.name || m.user.email || "Doctor"}
                      </option>
                    ))}
                  </select>
                )}
              {memberships.length > 1 && (
                <select
                  value={practiceIdx}
                  onChange={(e) => setPracticeIdx(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-800"
                >
                  {memberships.map((m, i) => (
                    <option key={m.practice.id} value={i}>
                      {m.practice.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          }
        />
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            {practice?.name || "Practice"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {isClinicAdmin &&
              rosterDoctors.length >= 1 &&
              (tab === "calendar" || tab === "setup") && (
                <select
                  value={providerId ?? ""}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedProviderId(next);
                    router.replace(practiceTabUrl(tab, next), {
                      scroll: false,
                    });
                  }}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-800"
                  aria-label="Select doctor to override"
                >
                  {rosterDoctors.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name || m.user.email || "Doctor"}
                    </option>
                  ))}
                </select>
              )}
            {memberships.length > 1 && (
              <select
                value={practiceIdx}
                onChange={(e) => setPracticeIdx(Number(e.target.value))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-800"
              >
                {memberships.map((m, i) => (
                  <option key={m.practice.id} value={i}>
                    {m.practice.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      <div
        className="mb-6 -mx-1 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Practice sections"
      >
        <div className="flex min-w-max gap-1 border-b border-slate-200 dark:border-white/10">
        {(
          [
            "calendar",
            "setup",
            ...(isClinicAdmin ? (["doctors"] as Tab[]) : []),
            "inbox",
          ] as Tab[]
        ).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              router.replace(practiceTabUrl(t), { scroll: false });
            }}
            className={`min-h-11 shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
              tab === t
                ? "border-b-2 border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            {PRACTICE_TAB_LABELS[t]}
          </button>
        ))}
        </div>
      </div>

      {message && (
        <p className="mb-4 text-sm font-medium text-green-700 dark:text-green-400" role="status">
          {message}
        </p>
      )}

      {tab === "calendar" && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              href="/doctor/dashboard"
              className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"
            >
              Open live queue
            </Link>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-4 text-sm font-semibold dark:border-neutral-600"
              onClick={() => {
                setTab("setup");
                setSetupPane("blocks");
                router.replace(practiceTabUrl("setup"), { scroll: false });
              }}
            >
              Block / leave today
            </button>
          </div>
          <DoctorSchedulePanel
            date={date}
            setDate={setDate}
            calendar={calendar}
            doctorName={
              rosterDoctors.find((m) => m.userId === providerId)?.user.name ||
              rosterDoctors.find((m) => m.userId === providerId)?.user.email ||
              "Doctor"
            }
          />
        </>
      )}

      {tab === "setup" && practice && providerId && (
        <div className="space-y-4">
          {isClinicAdmin ? (
            <p className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
              Clinic override: you can change this doctor&apos;s weekly hours,
              booking mode, validity, and leave blocks. Doctors can also edit
              their own settings from Doctor Login.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Setup">
            {(
              [
                { id: "hours" as const, label: "Weekly hours" },
                { id: "blocks" as const, label: "Overrides" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={setupPane === p.id}
                onClick={() => setSetupPane(p.id)}
                className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${
                  setupPane === p.id
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "border border-neutral-300 dark:border-neutral-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {setupPane === "hours" && locationId && (
            <SchedulePanel
              practiceId={practice.id}
              providerId={providerId}
              locationId={locationId}
              schedules={schedules as ScheduleRow[]}
              providerUser={
                practice.members.find((m) => m.userId === providerId)?.user ?? {
                  id: providerId,
                  name: null,
                  doctor: null,
                }
              }
              onSaved={() => {
                setMessage("Doctor settings saved.");
                void loadSchedules();
                void reloadMemberships();
              }}
            />
          )}
          {setupPane === "blocks" && (
            <OverridesPanel
              practiceId={practice.id}
              providerId={providerId}
              overrides={overrides}
              canManageExtraSlots={isClinicAdmin}
              onSaved={() => {
                setMessage("Override created.");
                void loadOverrides();
                void loadCalendar();
              }}
            />
          )}
        </div>
      )}

      {tab === "doctors" && practice && (
        <DoctorsPanel
          practiceId={practice.id}
          members={practice.members}
          canManage={isClinicAdmin}
          onChanged={async () => {
            setMessage("Doctor roster updated.");
            await reloadMemberships();
          }}
        />
      )}

      {tab === "inbox" && practice && (
        <InboxPanel
          practiceId={practice.id}
          onChanged={() => setMessage("Conversation updated.")}
        />
      )}
    </div>
  );
}

function InboxPanel({
  practiceId,
  onChanged,
}: {
  practiceId: string;
  onChanged: () => void;
}) {
  const { conversationTick } = usePracticeDashboard();
  const [rows, setRows] = useState<
    Array<{
      id: string;
      patientPhone: string;
      status: string;
      updatedAt: string;
    }>
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [whatsappOk, setWhatsappOk] = useState(true);
  const [waHint, setWaHint] = useState("");

  const load = useCallback(async () => {
    const res = await proctoService.listConversations(practiceId);
    if (res.status === "successful") setRows((res.data as typeof rows) ?? []);
  }, [practiceId]);

  useEffect(() => {
    void load();
  }, [load, conversationTick]);

  useEffect(() => {
    let cancelled = false;
    void proctoService.getPracticeBilling(practiceId).then((res) => {
      if (cancelled || res?.status !== "successful" || !res.data) return;
      const data = res.data as {
        entitlement?: {
          usable?: boolean;
          features?: Record<string, unknown>;
        };
        practice?: {
          whatsappNumber?: { phoneNumber: string; status: string } | null;
        };
      };
      const ent = data.entitlement;
      const hasLine =
        Boolean(ent?.usable) &&
        (ent?.features?.whatsappLine === true ||
          ent?.features?.whatsappLine === 1 ||
          Number(ent?.features?.whatsappLine) > 0);
      setWhatsappOk(hasLine);
      if (!ent?.usable) {
        setWaHint(
          "Subscribe under Subscription to unlock the WhatsApp booking line.",
        );
      } else if (!hasLine) {
        setWaHint("WhatsApp line is included from Starter upward — check Subscription.");
      } else if (!data.practice?.whatsappNumber) {
        setWaHint(
          "Connect your clinic WhatsApp number under Subscription → WhatsApp booking line.",
        );
      } else {
        setWaHint("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [practiceId]);

  async function setStatus(
    id: string,
    status: "bot_active" | "handed_off" | "closed",
  ) {
    setBusyId(id);
    const res = await proctoService.setConversationStatus(
      practiceId,
      id,
      status,
    );
    setBusyId(null);
    if (res.status === "successful") {
      onChanged();
      await load();
    }
  }

  return (
    <div className="space-y-4">
      {!whatsappOk || waHint ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {waHint || "WhatsApp inbox requires an active plan with WhatsApp."}{" "}
          <Link
            href={DOCTOR_SUBSCRIPTION_HREF}
            className="font-semibold underline"
          >
            Subscription
          </Link>
        </p>
      ) : null}
      <p className="text-sm opacity-70">
        Take over a WhatsApp thread to silence the bot, or return it to{" "}
        <span className="font-medium">bot_active</span>. Private visit notes stay
        on the booking and are never sent over WhatsApp.
      </p>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
        {rows.length === 0 && (
          <li className="py-3 text-sm opacity-60">No conversations yet.</li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
          >
            <div>
              <p className="font-semibold tabular-nums">{r.patientPhone}</p>
              <p className="text-xs opacity-60">
                {r.status} · {new Date(r.updatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyId === r.id || !whatsappOk}
                className="min-h-11 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold dark:border-neutral-600 disabled:opacity-50"
                onClick={() => void setStatus(r.id, "handed_off")}
              >
                Take over
              </button>
              <button
                type="button"
                disabled={busyId === r.id || !whatsappOk}
                className="min-h-11 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold dark:border-neutral-600 disabled:opacity-50"
                onClick={() => void setStatus(r.id, "bot_active")}
              >
                Return to bot
              </button>
              <button
                type="button"
                disabled={busyId === r.id || !whatsappOk}
                className="min-h-11 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold opacity-80 dark:border-neutral-600 disabled:opacity-50"
                onClick={() => void setStatus(r.id, "closed")}
              >
                Close
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DoctorsPanel({
  practiceId,
  members,
  canManage,
  onChanged,
}: {
  practiceId: string;
  members: PracticeMember["practice"]["members"];
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [canAddDoctor, setCanAddDoctor] = useState(true);
  const [planHint, setPlanHint] = useState("");

  const doctors = members.filter(
    (m) => m.role === "DOCTOR" || m.role === "PRACTICE_OWNER",
  );

  useEffect(() => {
    let cancelled = false;
    void proctoService.getPracticeBilling(practiceId).then((res) => {
      if (cancelled || res?.status !== "successful" || !res.data) return;
      const ent = (
        res.data as {
          entitlement?: {
            usable?: boolean;
            features?: Record<string, unknown>;
          };
        }
      ).entitlement;
      const multi =
        ent?.features?.multiDoctor === true ||
        ent?.features?.multiDoctor === 1;
      if (!ent?.usable) {
        setCanAddDoctor(false);
        setPlanHint(
          "Active subscription required to add doctors. Open Subscription to subscribe.",
        );
      } else if (doctors.length >= 1 && !multi) {
        setCanAddDoctor(false);
        setPlanHint(
          "Multi-doctor clinics require Growth or Clinic. Upgrade under Subscription.",
        );
      } else {
        setCanAddDoctor(true);
        setPlanHint("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [practiceId, doctors.length]);

  async function addDoctor() {
    setError("");
    setMessage("");
    if (!canAddDoctor) {
      setError(planHint || "Upgrade your plan to add more doctors.");
      return;
    }
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Name, email, and password are required for doctor login.");
      return;
    }
    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const res = await proctoService.addPracticeDoctor(practiceId, {
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
      phone: phone.trim() || undefined,
      specialty: specialty.trim() || undefined,
      licenseNo: licenseNo.trim() || undefined,
    });
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not add doctor.");
      return;
    }
    setMessage("Doctor added. They can sign in with this email and password.");
    setName("");
    setEmail("");
    setPassword("");
    setPhone("");
    setSpecialty("");
    setLicenseNo("");
    await onChanged();
  }

  async function deactivate(userId: string) {
    setBusy(true);
    const res = await proctoService.setPracticeMemberActive(
      practiceId,
      userId,
      false,
    );
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not deactivate doctor.");
      return;
    }
    await onChanged();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border dark:border-neutral-700 p-4">
        <h2 className="font-semibold mb-3">Clinic doctors</h2>
        <ul className="space-y-3">
          {doctors.map((m) => (
            <li
              key={m.userId}
              className="flex items-start justify-between gap-3 rounded-lg border dark:border-neutral-700 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {m.user.name || "Unnamed"}
                  <span className="ml-2 text-xs font-normal opacity-60">
                    {m.role.replace(/_/g, " ")}
                  </span>
                </p>
                <p className="text-xs opacity-70 truncate">{m.user.email}</p>
                {m.user.phone ? (
                  <p className="text-xs opacity-70">{m.user.phone}</p>
                ) : null}
                {m.user.doctor?.licenseNo ? (
                  <p className="text-xs opacity-60 mt-1">
                    License: {m.user.doctor.licenseNo}
                  </p>
                ) : null}
                {m.user.doctor?.description ? (
                  <p className="text-xs opacity-60 mt-0.5 line-clamp-2">
                    {m.user.doctor.description}
                  </p>
                ) : null}
              </div>
              {canManage && m.role === "DOCTOR" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deactivate(m.userId)}
                  className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Deactivate
                </button>
              ) : null}
            </li>
          ))}
          {!doctors.length && (
            <p className="text-xs opacity-60">No doctors on this clinic yet.</p>
          )}
        </ul>
      </section>

      <section className="rounded-xl border dark:border-neutral-700 p-4">
        <h2 className="font-semibold mb-1">Add doctor</h2>
        <p className="text-xs opacity-60 mb-4">
          Enter the doctor&apos;s name, email, and password — they use that
          email and password to log in to the doctor portal.
        </p>
        {planHint ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {planHint}{" "}
            <Link
              href={DOCTOR_SUBSCRIPTION_HREF}
              className="font-semibold underline"
            >
              Open Subscription
            </Link>
          </p>
        ) : null}
        {!canManage ? (
          <p className="text-sm opacity-70">
            Only clinic owners can add or deactivate doctors.
          </p>
        ) : !canAddDoctor ? (
          <p className="text-sm opacity-70">
            Upgrade your plan to add more doctors to this clinic.
          </p>
        ) : (
          <div className="space-y-3">
            <input
              placeholder="Doctor name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
            />
            <input
              placeholder="Login email *"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
            />
            <input
              placeholder="Login password *"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
            />
            <input
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
            />
            <input
              placeholder="Specialty"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
            />
            <input
              placeholder="License no"
              value={licenseNo}
              onChange={(e) => setLicenseNo(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
            />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            {message ? (
              <p className="text-xs text-green-700 dark:text-green-400">
                {message}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy || !canAddDoctor}
              onClick={() => void addDoctor()}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Add to clinic"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}


function DoctorSchedulePanel({
  date,
  setDate,
  calendar,
  doctorName,
}: {
  date: string;
  setDate: (d: string) => void;
  calendar: CalendarData | null;
  doctorName: string;
}) {
  const bookingMode =
    calendar?.configuredMode ??
    (calendar?.timeSlots.length
      ? "TIME_BASED"
      : calendar?.tokenSessions.length
        ? "TOKEN_BASED"
        : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Schedule for {doctorName}</h2>
          <p className="text-sm opacity-70">
            Slot capacity and session overview by doctor. Patient queues live on
            each doctor&apos;s dashboard.
          </p>
          {bookingMode && (
            <p className="mt-1 text-xs font-medium opacity-80">
              Booking mode:{" "}
              {bookingMode === "TOKEN_BASED" ? "Token queue" : "Time slots"}
            </p>
          )}
        </div>
        <label className="block text-sm">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-lg border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
      </div>

      {bookingMode === "TIME_BASED" ? (
        <section className="rounded-xl border p-4 dark:border-neutral-700">
          <h3 className="mb-3 font-semibold">Time slots</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2">
            {calendar?.timeSlots.map((s) => {
              const label = formatPracticeTime(s.start)
              const filled = s.booked > 0
              return (
                <div
                  key={s.start}
                  title={`${label} · ${s.booked} of ${s.capacity} booked`}
                  className={`inline-flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-semibold tabular-nums ${
                    filled
                      ? "border-green-500 bg-green-100 text-green-800 dark:border-green-500/60 dark:bg-green-900/40 dark:text-green-200"
                      : "border-neutral-300 bg-neutral-100 text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`text-xs font-bold ${
                      filled ? "opacity-90" : "opacity-70"
                    }`}
                  >
                    {s.booked}/{s.capacity}
                  </span>
                </div>
              )
            })}
            {!calendar?.timeSlots.length && (
              <p className="col-span-full text-xs opacity-60">
                No time-based schedule for this day.
              </p>
            )}
          </div>
        </section>
      ) : bookingMode === "TOKEN_BASED" ? (
        <section className="rounded-xl border p-4 dark:border-neutral-700">
          <h3 className="mb-3 font-semibold">Token session</h3>
          {calendar?.tokenSessions[0] ? (
            <div className="space-y-1 text-sm">
              <p>
                {calendar.tokenSessions[0].sessionStart}–
                {calendar.tokenSessions[0].sessionEnd}
              </p>
              <p>
                Issued: {calendar.tokenSessions[0].issued} /{" "}
                {calendar.tokenSessions[0].capacity}
              </p>
              <p>Next token: #{calendar.tokenSessions[0].nextToken}</p>
              <p
                className={
                  calendar.tokenSessions[0].available
                    ? "text-green-700 dark:text-green-300"
                    : "opacity-60"
                }
              >
                {calendar.tokenSessions[0].available
                  ? "Accepting tokens"
                  : "Session full / closed"}
              </p>
            </div>
          ) : (
            <p className="text-xs opacity-60">
              No token-based schedule for this day.
            </p>
          )}
        </section>
      ) : (
        <p className="text-sm opacity-60">No schedule configured for this doctor.</p>
      )}

      {!!calendar?.overrides.length && (
        <section className="rounded-xl border border-amber-300 p-4 dark:border-amber-700">
          <h3 className="mb-2 font-semibold text-amber-800 dark:text-amber-200">
            Active overrides
          </h3>
          <ul className="space-y-1 text-sm">
            {calendar.overrides.map((o) => (
              <li key={o.id}>
                {o.type.replace(/_/g, " ")}
                {o.reason ? ` — ${o.reason}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs opacity-60">
        Day summary: {calendar?.bookings.length ?? 0} booking
        {(calendar?.bookings.length ?? 0) === 1 ? "" : "s"} ·{" "}
        {calendar?.bookings.filter((b) => b.status === "COMPLETED").length ?? 0}{" "}
        completed ·{" "}
        {calendar?.bookings.filter((b) =>
          ["SCHEDULED", "IN_PROGRESS"].includes(b.status),
        ).length ?? 0}{" "}
        active
      </p>
    </div>
  );
}

function SchedulePanel({
  practiceId,
  providerId,
  locationId,
  schedules,
  providerUser,
  onSaved,
}: {
  practiceId: string;
  providerId: string;
  locationId: string;
  schedules: ScheduleRow[];
  providerUser: {
    id: string;
    name: string | null;
    doctor?: {
      licenseNo: string | null;
      appointmentValidityDays: number;
    } | null;
  };
  onSaved: () => void;
}) {
  const seed = schedules[0];
  const seedStart =
    seed?.startTime || seed?.sessionStart || "09:00";
  const seedEnd = seed?.endTime || seed?.sessionEnd || "17:00";

  const [name, setName] = useState(providerUser.name ?? "");
  const [licenseNo, setLicenseNo] = useState(
    providerUser.doctor?.licenseNo ?? "",
  );
  const [bookingType, setBookingType] = useState<"TIME" | "TOKEN">(
    seed?.mode === "TOKEN_BASED" ? "TOKEN" : "TIME",
  );
  const [workingDays, setWorkingDays] = useState<number[]>(() =>
    schedules.length
      ? [...new Set(schedules.map((s) => s.dayOfWeek))].sort()
      : [1, 2, 3, 4, 5],
  );
  const [startTime, setStartTime] = useState(seedStart);
  const [endTime, setEndTime] = useState(seedEnd);
  const [breakStartTime, setBreakStartTime] = useState(
    seed?.breakStartTime || "13:00",
  );
  const [breakEndTime, setBreakEndTime] = useState(
    seed?.breakEndTime || "14:00",
  );
  const [slotDurationMins, setSlotDurationMins] = useState(
    String(seed?.slotIntervalMin || 15),
  );
  const [patientsPerSlot, setPatientsPerSlot] = useState(
    String(seed?.maxPerSlot || 1),
  );
  const [appointmentValidityDays, setAppointmentValidityDays] = useState(
    String(providerUser.doctor?.appointmentValidityDays ?? 7),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(providerUser.name ?? "");
    setLicenseNo(providerUser.doctor?.licenseNo ?? "");
    setAppointmentValidityDays(
      String(providerUser.doctor?.appointmentValidityDays ?? 7),
    );
  }, [providerUser]);

  useEffect(() => {
    if (!schedules.length) return;
    const first = schedules[0];
    setBookingType(first.mode === "TOKEN_BASED" ? "TOKEN" : "TIME");
    setWorkingDays([...new Set(schedules.map((s) => s.dayOfWeek))].sort());
    setStartTime(first.startTime || first.sessionStart || "09:00");
    setEndTime(first.endTime || first.sessionEnd || "17:00");
    setBreakStartTime(first.breakStartTime || "");
    setBreakEndTime(first.breakEndTime || "");
    setSlotDurationMins(String(first.slotIntervalMin || 15));
    setPatientsPerSlot(String(first.maxPerSlot || 1));
  }, [schedules]);

  function toggleDay(day: number) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  async function save() {
    setError("");
    if (!name.trim() || !licenseNo.trim()) {
      setError("Dr Name and license number are required.");
      return;
    }
    if (workingDays.length === 0) {
      setError("Select at least one working day.");
      return;
    }

    setSaving(true);
    const res = await proctoService.saveProviderSettings(practiceId, {
      providerId,
      locationId,
      name: name.trim(),
      licenseNo: licenseNo.trim(),
      bookingType,
      workingDays,
      startTime,
      endTime,
      breakStartTime: breakStartTime || undefined,
      breakEndTime: breakEndTime || undefined,
      slotDurationMins: Number(slotDurationMins) || 15,
      patientsPerSlot: Number(patientsPerSlot) || 1,
      appointmentValidityDays: (() => {
        const days = Number(appointmentValidityDays);
        return Number.isFinite(days) && days >= 1 && days <= 90 ? days : 7;
      })(),
    });
    setSaving(false);

    if (res.status !== "successful") {
      setError(res.message || "Could not save settings.");
      return;
    }
    onSaved();
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rounded-xl border dark:border-neutral-700 p-4 space-y-5">
        <h2 className="font-semibold">Doctor & schedule settings</h2>
        <p className="text-xs opacity-60 -mt-3">
          Same fields as doctor registration — update anytime.
        </p>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
            Doctor profile
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="opacity-70 text-xs">Dr Name *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700"
              />
            </label>
            <label className="block text-sm">
              <span className="opacity-70 text-xs">Dr license number *</span>
              <input
                value={licenseNo}
                onChange={(e) => setLicenseNo(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
            Booking type
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ["TIME", "Time slots"],
                ["TOKEN", "Token queue"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBookingType(id)}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  bookingType === id
                    ? "border-[#0099ff] bg-[#0099ff]/10"
                    : "dark:border-neutral-700 opacity-70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs opacity-60">
            One mode per doctor — time slots or token queue, not both. Saving
            replaces the other mode.
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
            Working days
          </p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const active = workingDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`min-w-[3rem] rounded-full px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                      : "border dark:border-neutral-700 opacity-60"
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
            Working time
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="opacity-70 text-xs">Start *</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700"
              />
            </label>
            <label className="text-sm">
              <span className="opacity-70 text-xs">End *</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
            Break time (interval)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="opacity-70 text-xs">Break start</span>
              <input
                type="time"
                value={breakStartTime}
                onChange={(e) => setBreakStartTime(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700"
              />
            </label>
            <label className="text-sm">
              <span className="opacity-70 text-xs">Break end</span>
              <input
                type="time"
                value={breakEndTime}
                onChange={(e) => setBreakEndTime(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
            {bookingType === "TIME" ? "Slot settings" : "Token settings"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {bookingType === "TIME" ? (
              <label className="text-sm">
                <span className="opacity-70 text-xs">Per slot duration (mins) *</span>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={slotDurationMins}
                  onChange={(e) => setSlotDurationMins(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700"
                />
              </label>
            ) : null}
            <label className="text-sm">
              <span className="opacity-70 text-xs">
                {bookingType === "TIME"
                  ? "No. of patients in slots *"
                  : "Patients per token interval *"}
              </span>
              <input
                type="number"
                min={1}
                max={50}
                value={patientsPerSlot}
                onChange={(e) => setPatientsPerSlot(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700"
              />
            </label>
            <label className="text-sm col-span-2">
              <span className="opacity-70 text-xs">Appointment validity (days) *</span>
              <input
                type="number"
                min={1}
                max={90}
                value={appointmentValidityDays}
                onChange={(e) => setAppointmentValidityDays(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700"
              />
              <span className="mt-1 block text-xs opacity-50">
                How far ahead patients can book (1–90 days).
              </span>
            </label>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      <div className="rounded-xl border dark:border-neutral-700 p-4">
        <h2 className="font-semibold mb-3">Current schedules</h2>
        <ul className="text-sm space-y-2">
          {schedules.map((s, i) => (
            <li
              key={i}
              className="rounded-lg border dark:border-neutral-700 px-3 py-2"
            >
              <span className="font-medium">{DAYS[s.dayOfWeek]}</span> ·{" "}
              {s.mode === "TOKEN_BASED" ? "Token" : "Time"}
              <span className="opacity-70 ml-2">
                {(s.startTime || s.sessionStart) ?? "—"}–
                {(s.endTime || s.sessionEnd) ?? "—"}
              </span>
              {s.breakStartTime && s.breakEndTime && (
                <span className="opacity-60 ml-2 text-xs">
                  break {s.breakStartTime}–{s.breakEndTime}
                </span>
              )}
              {s.slotIntervalMin != null && (
                <span className="opacity-60 ml-2 text-xs">
                  {s.slotIntervalMin}m · {s.maxPerSlot ?? 1}/slot
                </span>
              )}
            </li>
          ))}
          {!schedules.length && (
            <p className="text-xs opacity-60">No schedules configured yet.</p>
          )}
        </ul>
      </div>
    </div>
  );
}

function OverridesPanel({
  practiceId,
  providerId,
  overrides,
  canManageExtraSlots,
  onSaved,
}: {
  practiceId: string;
  providerId: string;
  overrides: unknown[];
  canManageExtraSlots: boolean;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("BLOCK_DAY");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [maxTokens, setMaxTokens] = useState(20);
  const [extraCapacity, setExtraCapacity] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const overrideOptions = canManageExtraSlots
    ? [...OVERRIDE_TYPES, EXTRA_SLOT_TYPE]
    : OVERRIDE_TYPES;

  async function submit() {
    setError("");
    const body: Record<string, unknown> = { providerId, date, type, reason };
    if (type === "BLOCK_SLOT" || type === EXTRA_SLOT_TYPE) {
      Object.assign(body, { startTime, endTime });
    }
    if (type === "TOKEN_LIMIT_ADJUST") Object.assign(body, { maxTokens });
    if (type === EXTRA_SLOT_TYPE && extraCapacity > 0) {
      Object.assign(body, { maxTokens: extraCapacity });
    }
    const res = await proctoService.createOverride(practiceId, body);
    if (res.status !== "successful") {
      setError(res.message || "Could not create override.");
      return;
    }
    onSaved();
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rounded-xl border dark:border-neutral-700 p-4 space-y-4">
        <h2 className="font-semibold">Create override</h2>
        {canManageExtraSlots && (
          <p className="text-xs opacity-60 -mt-2">
            Clinic admins can add extra bookable slots on a date using{" "}
            <span className="font-medium">Extra slot</span>.
          </p>
        )}

        <label className="block text-sm">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"
          />
        </label>

        <label className="block text-sm">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"
          >
            {overrideOptions.map((t) => (
              <option key={t} value={t}>
                {t === EXTRA_SLOT_TYPE ? "Extra slot" : t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        {(type === "BLOCK_SLOT" || type === EXTRA_SLOT_TYPE) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              From
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700" />
            </label>
            <label className="text-sm">
              To
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:bg-neutral-900 dark:border-neutral-700" />
            </label>
          </div>
        )}

        {type === EXTRA_SLOT_TYPE && (
          <label className="block text-sm">
            Patients per slot
            <input
              type="number"
              min={1}
              max={50}
              value={extraCapacity}
              onChange={(e) => setExtraCapacity(Number(e.target.value) || 1)}
              className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"
            />
            <span className="mt-1 block text-xs opacity-50">
              Uses your usual slot duration from doctor settings.
            </span>
          </label>
        )}

        {type === "TOKEN_LIMIT_ADJUST" && (
          <label className="block text-sm">
            Max tokens
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"
            />
          </label>
        )}

        <label className="block text-sm">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              type === EXTRA_SLOT_TYPE
                ? "Evening clinic, walk-in surge, etc."
                : "Emergency leave, conference, etc."
            }
            className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"
          />
        </label>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium"
        >
          {type === EXTRA_SLOT_TYPE ? "Add extra slots" : "Apply override"}
        </button>
      </div>

      <div className="rounded-xl border dark:border-neutral-700 p-4">
        <h2 className="font-semibold mb-3">Recent overrides</h2>
        <ul className="text-sm space-y-2">
          {(overrides as Array<{ id: string; type: string; date: string; reason: string | null }>).map(
            (o) => (
              <li key={o.id} className="rounded-lg border dark:border-neutral-700 px-3 py-2">
                <span className="font-medium">
                  {o.type === EXTRA_SLOT_TYPE
                    ? "Extra slot"
                    : o.type.replace(/_/g, " ")}
                </span>
                <span className="opacity-70 ml-2">{o.date.slice(0, 10)}</span>
                {o.reason && <p className="text-xs opacity-60 mt-1">{o.reason}</p>}
              </li>
            ),
          )}
          {!overrides.length && <p className="text-xs opacity-60">No overrides yet.</p>}
        </ul>
      </div>
    </div>
  );
}
