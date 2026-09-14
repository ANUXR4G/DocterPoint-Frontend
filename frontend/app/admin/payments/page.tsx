"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminSection from "@/components/admin/AdminSection"
import AdminTable from "@/components/admin/AdminTable"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import AdminMetricCard, { formatInr } from "@/components/admin/AdminMetricCard"
import { AdminBadge, statusTone } from "@/components/admin/AdminBadge"
import { adminService } from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

type Subscription = {
  id: string
  status: string
  gracePeriodEnd?: string | null
  currentPeriodEnd?: string | null
  practice?: { id?: string; name?: string; slug?: string } | null
  plan?: { id?: string; name?: string; priceMonthlyInr?: number } | null
}

type PlanRow = {
  id: string
  name: string
  priceMonthlyInr: number
  isActive: boolean
}

const ACTIVE_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE", "GRACE"])

export default function AdminPaymentsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [activatePracticeId, setActivatePracticeId] = useState("")
  const [activatePlanId, setActivatePlanId] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const [subRes, planRes] = await Promise.all([
      adminService.subscriptions(),
      adminService.plans(),
    ])
    if (subRes.status === "successful") {
      setSubscriptions((subRes.data as Subscription[]) ?? [])
    }
    if (planRes.status === "successful" && Array.isArray(planRes.data)) {
      const activePlans = planRes.data.filter((p) => p.isActive)
      setPlans(activePlans)
      setActivatePlanId((prev) => prev || activePlans[0]?.id || "")
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsRefresh(() => void load())

  const summary = useMemo(() => {
    const active = subscriptions.filter((s) => ACTIVE_STATUSES.has(s.status))
    const mrr = active.reduce(
      (sum, s) => sum + (s.plan?.priceMonthlyInr ?? 0),
      0,
    )
    const pastDue = subscriptions.filter(
      (s) => s.status === "PAST_DUE" || s.status === "GRACE",
    ).length
    return { total: subscriptions.length, active: active.length, mrr, pastDue }
  }, [subscriptions])

  function notify(ok: boolean, text: string) {
    setMessageTone(ok ? "success" : "error")
    setMessage(text)
  }

  async function runSimulate(practiceId: string, action: string) {
    setBusyId(`${practiceId}:${action}`)
    const res = await adminService.simulateBilling(practiceId, action)
    notify(
      res.status === "successful",
      res.status === "successful"
        ? `Billing action “${action}” applied.`
        : res.message || "Billing action failed.",
    )
    setBusyId(null)
    if (res.status === "successful") await load()
  }

  async function activatePaid(e: React.FormEvent) {
    e.preventDefault()
    if (!activatePracticeId.trim() || !activatePlanId) return
    setBusyId("activate")
    const res = await adminService.startSubscription(
      activatePracticeId.trim(),
      activatePlanId,
    )
    notify(
      res.status === "successful",
      res.status === "successful"
        ? "Paid subscription activated."
        : res.message || "Activate failed.",
    )
    setBusyId(null)
    if (res.status === "successful") {
      setActivatePracticeId("")
      await load()
    }
  }

  async function graceTick() {
    setBusyId("grace")
    // practiceId required by API; grace_tick ignores it for global sweep
    const anyId = subscriptions[0]?.practice?.id || "00000000-0000-0000-0000-000000000000"
    const res = await adminService.simulateBilling(anyId, "grace_tick")
    notify(
      res.status === "successful",
      res.status === "successful"
        ? "Grace expirations processed."
        : res.message || "Grace tick failed.",
    )
    setBusyId(null)
    if (res.status === "successful") await load()
  }

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="Payments"
        subtitle="Clinic subscriptions, activate paid plans, and ops billing simulations."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
          >
            Refresh
          </button>
        }
      />

      {message ? <AdminAlert tone={messageTone}>{message}</AdminAlert> : null}

      <div className="dashboard-grid-4">
        <AdminMetricCard
          label="Total subscriptions"
          value={String(summary.total)}
          loading={loading}
          tone="blue"
        />
        <AdminMetricCard
          label="Active / paying"
          value={String(summary.active)}
          loading={loading}
          tone="green"
        />
        <AdminMetricCard
          label="Monthly revenue (MRR)"
          value={formatInr(summary.mrr)}
          loading={loading}
          tone="amber"
        />
        <AdminMetricCard
          label="Needs payment"
          value={String(summary.pastDue)}
          hint="Past due or in grace period"
          loading={loading}
          tone="rose"
        />
      </div>

      <div className="dashboard-grid-2">
        <AdminSection
          title="Activate paid plan"
          description="Force ACTIVE subscription for a clinic (ops / demos)."
          compact
        >
          <form onSubmit={activatePaid} className="flex flex-col gap-3">
            <input
              value={activatePracticeId}
              onChange={(e) => setActivatePracticeId(e.target.value)}
              placeholder="Practice UUID…"
              className="form-input min-h-11 w-full rounded-xl border-slate-200 bg-white px-4 text-sm shadow-sm dark:border-white/15 dark:bg-white/5"
            />
            <select
              value={activatePlanId}
              onChange={(e) => setActivatePlanId(e.target.value)}
              className="form-input min-h-11 w-full rounded-xl border-slate-200 bg-white px-4 text-sm shadow-sm dark:border-white/15 dark:bg-white/5"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatInr(p.priceMonthlyInr)}/mo
                </option>
              ))}
            </select>
            <AdminButton type="submit" disabled={busyId === "activate"}>
              {busyId === "activate" ? "Activating…" : "Activate paid"}
            </AdminButton>
          </form>
        </AdminSection>

        <AdminSection
          title="Billing simulations"
          description="Ops-only state transitions (not live Razorpay)."
          compact
        >
          <AdminButton
            variant="secondary"
            onClick={() => void graceTick()}
            disabled={busyId === "grace"}
          >
            {busyId === "grace" ? "Running…" : "Process grace expirations"}
          </AdminButton>
          <p className="mt-3 text-xs text-slate-500">
            Per-clinic actions are on each subscription row: mark Active, Past
            due, or Suspend.
          </p>
        </AdminSection>
      </div>

      <AdminSection
        title="All subscriptions"
        count={subscriptions.length}
        description="Each row is one clinic’s current plan and billing status"
      >
        <AdminTable
          loading={loading}
          rows={subscriptions}
          emptyMessage="No subscriptions yet"
          emptyDescription="Subscriptions appear when clinics choose a plan."
          columns={[
            {
              key: "practice",
              header: "Clinic",
              cell: (s) => (
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {s.practice?.name || "—"}
                  </p>
                  {s.practice?.slug ? (
                    <p className="text-xs text-slate-500">/{s.practice.slug}</p>
                  ) : null}
                  {s.practice?.id ? (
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {s.practice.id.slice(0, 8)}…
                    </p>
                  ) : null}
                </div>
              ),
            },
            {
              key: "plan",
              header: "Plan",
              cell: (s) => s.plan?.name || "—",
            },
            {
              key: "amount",
              header: "Per month",
              cell: (s) =>
                s.plan?.priceMonthlyInr != null ? (
                  <span className="font-medium tabular-nums">
                    {formatInr(s.plan.priceMonthlyInr)}
                  </span>
                ) : (
                  "—"
                ),
            },
            {
              key: "status",
              header: "Status",
              cell: (s) => (
                <AdminBadge tone={statusTone(s.status)}>{s.status}</AdminBadge>
              ),
            },
            {
              key: "renewal",
              header: "Renews / ends",
              cell: (s) => {
                const date = s.currentPeriodEnd || s.gracePeriodEnd
                return date ? (
                  <span className="text-slate-600 dark:text-slate-400">
                    {new Date(date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                ) : (
                  "—"
                )
              },
            },
            {
              key: "actions",
              header: "Simulate",
              cell: (s) => {
                const pid = s.practice?.id
                if (!pid) return <span className="text-xs text-slate-400">—</span>
                return (
                  <div className="flex flex-col gap-1.5">
                    <AdminButton
                      size="sm"
                      disabled={busyId?.startsWith(pid)}
                      onClick={() => void runSimulate(pid, "active")}
                    >
                      Active
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      disabled={busyId?.startsWith(pid)}
                      onClick={() => void runSimulate(pid, "past_due")}
                    >
                      Past due
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      variant="danger"
                      disabled={busyId?.startsWith(pid)}
                      onClick={() => void runSimulate(pid, "suspend")}
                    >
                      Suspend
                    </AdminButton>
                  </div>
                )
              },
            },
          ]}
        />
      </AdminSection>
    </AdminShell>
  )
}
