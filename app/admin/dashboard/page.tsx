"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminSection from "@/components/admin/AdminSection"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminMetricCard, { formatInr } from "@/components/admin/AdminMetricCard"
import dynamic from "next/dynamic"
import { InsightStatCard } from "@/components/dashboard/InsightStatCard"
import { AdminBadge, statusTone } from "@/components/admin/AdminBadge"
import {
  adminService,
  type AdminAnalytics,
  type AdminOverview,
} from "@/lib/services/admin"
import type { IconNames } from "@/types"
import { useAdminOpsSocket } from "@/hooks/useProctoSocket"

const GrowthLineChart = dynamic(
  () =>
    import("@/components/admin/AdminCharts").then((m) => m.GrowthLineChart),
  { ssr: false },
)
const RevenueTrendChart = dynamic(
  () =>
    import("@/components/admin/AdminCharts").then((m) => m.RevenueTrendChart),
  { ssr: false },
)
const SubscriptionDoughnutChart = dynamic(
  () =>
    import("@/components/admin/AdminCharts").then(
      (m) => m.SubscriptionDoughnutChart,
    ),
  { ssr: false },
)
const BookingsTrendChart = dynamic(
  () =>
    import("@/components/admin/AdminCharts").then((m) => m.BookingsTrendChart),
  { ssr: false },
)
const DailyBookingsChart = dynamic(
  () =>
    import("@/components/admin/AdminCharts").then((m) => m.DailyBookingsChart),
  { ssr: false },
)
const MonthComparisonChart = dynamic(
  () =>
    import("@/components/admin/AdminCharts").then(
      (m) => m.MonthComparisonChart,
    ),
  { ssr: false },
)

const LINKS: Array<{
  href: string
  label: string
  key: keyof AdminOverview
  icon: IconNames
  tone: "blue" | "green" | "rose" | "amber"
  subtitle: string
}> = [
  {
    href: "/admin/doctors",
    label: "Doctors",
    key: "doctors",
    icon: "doctor",
    tone: "green",
    subtitle: "Active practice members",
  },
  {
    href: "/admin/clinics",
    label: "Clinics",
    key: "practices",
    icon: "three-people",
    tone: "amber",
    subtitle: "Practices on platform",
  },
  {
    href: "/admin/payments",
    label: "Payments",
    key: "subscriptions",
    icon: "heart-w-pulse",
    tone: "blue",
    subtitle: "Active subscriptions",
  },
  {
    href: "/admin/approvals",
    label: "Approvals",
    key: "escalations",
    icon: "inbox",
    tone: "amber",
    subtitle: "Open escalations",
  },
  {
    href: "/admin/approvals/numbers",
    label: "WhatsApp pipeline",
    key: "waNumbers",
    icon: "heart",
    tone: "green",
    subtitle: "N in go-live pipeline",
  },
]

const MONTH_OPTIONS = [
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
] as const

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-300"
      }`}
    >
      {children}
    </button>
  )
}

function toggleInSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set)
  if (next.has(key)) {
    if (next.size > 1) next.delete(key)
  } else {
    next.add(key)
  }
  return next
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState<3 | 6 | 12>(6)
  const [growthSeries, setGrowthSeries] = useState(
    () => new Set(["New clinics", "New subscriptions"]),
  )
  const [subStatuses, setSubStatuses] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const [overviewRes, analyticsRes] = await Promise.all([
      adminService.overview(),
      adminService.analytics({ months }),
    ])
    if (overviewRes.status === "successful" && overviewRes.data) {
      setOverview(overviewRes.data)
    } else {
      setError(overviewRes.message || "Failed to load overview. Sign in as admin.")
    }
    if (analyticsRes.status === "successful" && analyticsRes.data) {
      setAnalytics(analyticsRes.data)
      if (subStatuses.size === 0 && analyticsRes.data.subscriptionBreakdown.length) {
        setSubStatuses(
          new Set(analyticsRes.data.subscriptionBreakdown.map((s) => s.status)),
        )
      }
    }
    setLoading(false)
  }, [months, subStatuses.size])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsSocket(true, () => void load(), () => void load())

  const pendingTotal = overview
    ? overview.pendingReviews + overview.pendingTemplates
    : 0

  const monthName = new Date().toLocaleString("en-IN", { month: "long" })

  const allSubStatuses = useMemo(
    () => analytics?.subscriptionBreakdown.map((s) => s.status) ?? [],
    [analytics],
  )

  return (
    <AdminShell wide>
      <AdminPageHeader
        backHref={null}
        title="Control center"
        subtitle={`Platform analytics for ${monthName} — revenue, subscriptions, and operations.`}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
          >
            Refresh
          </button>
        }
      />

      {error ? <AdminAlert tone="error">{error}</AdminAlert> : null}

      <AdminSection
        title="Chart filters"
        description="Trend window and which series appear on multi-metric charts"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Trend period
            </span>
            {MONTH_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                active={months === opt.value}
                onClick={() => setMonths(opt.value)}
              >
                {opt.label}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Growth chart
            </span>
            {["New clinics", "New subscriptions"].map((key) => (
              <FilterChip
                key={key}
                active={growthSeries.has(key)}
                onClick={() => setGrowthSeries((s) => toggleInSet(s, key))}
              >
                {key}
              </FilterChip>
            ))}
          </div>
          {allSubStatuses.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subscriptions
              </span>
              {allSubStatuses.map((status) => (
                <FilterChip
                  key={status}
                  active={subStatuses.has(status)}
                  onClick={() => setSubStatuses((s) => toggleInSet(s, status))}
                >
                  {status}
                </FilterChip>
              ))}
            </div>
          ) : null}
        </div>
      </AdminSection>

      <div className="dashboard-grid-4">
        <AdminMetricCard
          label="Revenue this month"
          value={analytics ? formatInr(analytics.revenueThisMonth) : "—"}
          hint="New subscription plan value added"
          change={analytics?.revenueChangePercent}
          loading={loading}
          tone="blue"
          icon={<span className="text-lg">₹</span>}
        />
        <AdminMetricCard
          label="Last month"
          value={analytics ? formatInr(analytics.revenueLastMonth) : "—"}
          hint="New subscription revenue (prior month)"
          loading={loading}
          tone="amber"
        />
        <AdminMetricCard
          label="Platform MRR"
          value={analytics ? formatInr(analytics.mrr) : "—"}
          hint={`${analytics?.activeSubscriptions ?? 0} billable subscriptions`}
          loading={loading}
          tone="green"
        />
        <AdminMetricCard
          label="Active clinics"
          value={overview ? String(overview.activePractices) : "—"}
          hint={`${overview?.practices ?? 0} practices total`}
          loading={loading}
          tone="rose"
        />
      </div>

      <div className="dashboard-grid-2">
        <AdminSection
          title="Revenue trend"
          description={`New subscription revenue — last ${months} months`}
        >
          <div className="h-64 sm:h-72">
            {analytics ? (
              <RevenueTrendChart analytics={analytics} />
            ) : (
              <div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            )}
          </div>
        </AdminSection>

        <AdminSection title="Subscriptions" description="Status breakdown">
          <div className="mx-auto h-64 w-full max-w-xs sm:h-72">
            {analytics ? (
              <SubscriptionDoughnutChart
                analytics={analytics}
                visibleStatuses={subStatuses}
              />
            ) : (
              <div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            )}
          </div>
        </AdminSection>
      </div>

      <AdminSection
        title="Platform growth"
        description={`New clinics & subscriptions — last ${months} months`}
      >
        <div className="h-56 sm:h-64">
          {analytics ? (
            <GrowthLineChart analytics={analytics} visibleSeries={growthSeries} />
          ) : (
            <div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          )}
        </div>
      </AdminSection>

      <div className="dashboard-grid-2">
        <AdminSection
          title="Bookings & patients"
          description={`Volume trend — last ${months} months`}
        >
          <div className="h-64 sm:h-72">
            {analytics ? (
              <BookingsTrendChart analytics={analytics} />
            ) : (
              <div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            )}
          </div>
        </AdminSection>
        <AdminSection
          title="This vs last month"
          description="Revenue and booking comparison"
        >
          <div className="h-64 sm:h-72">
            {analytics ? (
              <MonthComparisonChart analytics={analytics} />
            ) : (
              <div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            )}
          </div>
        </AdminSection>
      </div>

      <AdminSection
        title="Daily bookings"
        description={
          analytics?.dailyMonthLabel
            ? `Days in ${analytics.dailyMonthLabel}`
            : "Bookings by day of month"
        }
      >
        <div className="h-56 sm:h-64">
          {analytics ? (
            <DailyBookingsChart analytics={analytics} />
          ) : (
            <div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          )}
        </div>
      </AdminSection>

      {loading ? (
        <div className="dashboard-grid-4 animate-pulse">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="min-h-[10.5rem] rounded-[20px] bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : overview ? (
        <>
          <AdminSection
            title="Quick navigation"
            description="Jump to management sections"
          >
            <div className="dashboard-grid-4">
              {LINKS.map((item) => (
                <InsightStatCard
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  value={overview[item.key] as number}
                  subtitle={item.subtitle}
                  icon={item.icon}
                  tone={item.tone}
                />
              ))}
            </div>
          </AdminSection>

          <div className="dashboard-grid-2">
            <AdminSection
              title="Subscription health"
              description="Billing status across all practices"
            >
              <div className="flex flex-wrap gap-2">
                {overview.subscriptionBreakdown.map((row) => (
                  <AdminBadge key={row.status} tone={statusTone(row.status)}>
                    {row.status}: {row.count}
                  </AdminBadge>
                ))}
                {!overview.subscriptionBreakdown.length ? (
                  <p className="text-sm text-slate-500">No subscriptions yet.</p>
                ) : null}
              </div>
            </AdminSection>

            <AdminSection
              title="Needs attention"
              description="Items that may require admin action"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 dark:border-amber-500/25 dark:bg-amber-500/10">
                  <p className="text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
                    {pendingTotal}
                  </p>
                  <p className="mt-1 text-sm font-medium text-amber-800/90 dark:text-amber-200/90">
                    Pending reviews & templates
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                  <p className="text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
                    {overview.activePractices}
                  </p>
                  <p className="mt-1 text-sm font-medium text-emerald-800/90 dark:text-emerald-200/90">
                    Active directory listings
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                {overview.pendingReviews} reviews · {overview.pendingTemplates}{" "}
                templates · {overview.escalations} escalations
              </p>
            </AdminSection>
          </div>
        </>
      ) : null}
    </AdminShell>
  )
}
