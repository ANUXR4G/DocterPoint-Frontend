"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminTable from "@/components/admin/AdminTable"
import AdminSearchBar from "@/components/admin/AdminSearchBar"
import AdminToolbar from "@/components/admin/AdminToolbar"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import AdminSection from "@/components/admin/AdminSection"
import { AdminBadge, statusTone } from "@/components/admin/AdminBadge"
import { adminService, type AdminPractice } from "@/lib/services/admin"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

type PlanRow = {
  id: string
  name: string
  priceMonthlyInr: number
  isActive: boolean
}

function formatPeriodEnd(iso?: string | null) {
  if (!iso) return "Open-ended"
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

export default function AdminClinicsPage() {
  const [rows, setRows] = useState<AdminPractice[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [trialPracticeId, setTrialPracticeId] = useState("")
  const [trialPlanId, setTrialPlanId] = useState("")
  const [trialDays, setTrialDays] = useState("")
  const [trialBusy, setTrialBusy] = useState(false)

  const load = useCallback(async (query?: string) => {
    setLoading(true)
    const res = await adminService.practices(query)
    if (res.status === "successful" && res.data) {
      setRows(res.data.items)
      setTotal(res.data.total)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    void adminService.plans().then((res) => {
      if (res.status === "successful" && Array.isArray(res.data)) {
        const list = res.data.filter((p) => p.isActive !== false)
        setPlans(list)
        if (list[0] && !trialPlanId) setTrialPlanId(list[0].id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load plans once
  }, [load])

  useAdminOpsRefresh(() => void load(q.trim() || undefined))

  async function patchPractice(
    row: AdminPractice,
    patch: { isActive?: boolean; isDirectoryListed?: boolean },
  ) {
    const res = await adminService.updatePractice(row.id, patch)
    if (res.status === "successful") {
      setMessageTone("success")
      setMessage(`${row.name} updated.`)
      await load(q.trim() || undefined)
    } else {
      setMessageTone("error")
      setMessage(res.message || "Update failed.")
    }
  }

  async function startTrial(e: React.FormEvent) {
    e.preventDefault()
    if (!trialPracticeId || !trialPlanId) {
      setMessageTone("error")
      setMessage("Select a clinic and plan.")
      return
    }
    const daysRaw = trialDays.trim()
    const days =
      daysRaw === "" ? null : Number.parseInt(daysRaw, 10)
    if (days != null && (!Number.isFinite(days) || days < 0)) {
      setMessageTone("error")
      setMessage("Trial days must be a positive number, or leave blank for open-ended.")
      return
    }

    setTrialBusy(true)
    const res = await adminService.startTrial({
      practiceId: trialPracticeId,
      planId: trialPlanId,
      trialDays: days && days > 0 ? days : null,
    })
    setTrialBusy(false)

    if (res.status === "successful" || res.status === "created") {
      const clinic = rows.find((r) => r.id === trialPracticeId)
      setMessageTone("success")
      setMessage(
        res.message ||
          `Trial started for ${clinic?.name ?? "clinic"}${
            days && days > 0 ? ` (${days} days)` : " (open-ended)"
          }.`,
      )
      setTrialDays("")
      await load(q.trim() || undefined)
    } else {
      setMessageTone("error")
      setMessage(res.message || "Could not start trial.")
    }
  }

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="Clinics"
        subtitle="Suspend practices, control directory listings, and start optional-period trials."
      />

      <AdminToolbar>
        <AdminSearchBar
          value={q}
          onChange={setQ}
          onSubmit={() => void load(q.trim() || undefined)}
          placeholder="Search clinic name or slug…"
        />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          <span className="font-bold tabular-nums text-slate-800 dark:text-white">
            {total}
          </span>{" "}
          practices
        </p>
      </AdminToolbar>

      {message ? (
        <AdminAlert tone={messageTone}>{message}</AdminAlert>
      ) : null}

      <AdminSection
        title="Start trial account"
        description="Grant TRIALING on a plan. Leave days blank for an open-ended trial (no auto end date)."
      >
        <form
          onSubmit={(e) => void startTrial(e)}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
              Clinic
            </span>
            <select
              value={trialPracticeId}
              onChange={(e) => setTrialPracticeId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-white/5"
              required
            >
              <option value="">Select clinic…</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.subscription ? ` (${r.subscription.status})` : " (no plan)"}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
              Plan
            </span>
            <select
              value={trialPlanId}
              onChange={(e) => setTrialPlanId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-white/5"
              required
            >
              {plans.length === 0 ? (
                <option value="">Loading plans…</option>
              ) : (
                plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · ₹{p.priceMonthlyInr}/mo
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
              Trial days{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              type="number"
              min={0}
              max={3650}
              placeholder="Blank = open-ended"
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-white/5"
            />
          </label>

          <div className="flex items-end">
            <AdminButton type="submit" disabled={trialBusy} className="w-full">
              {trialBusy ? "Starting…" : "Start trial"}
            </AdminButton>
          </div>
        </form>
      </AdminSection>

      <AdminTable
        loading={loading}
        rows={rows}
        emptyMessage="No clinics found"
        emptyDescription="Try a different clinic name or slug."
        columns={[
          {
            key: "name",
            header: "Clinic",
            cell: (r) => (
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {r.name}
                </p>
                <p className="text-xs text-slate-500">/{r.slug}</p>
              </div>
            ),
          },
          {
            key: "subscription",
            header: "Plan",
            cell: (r) =>
              r.subscription ? (
                <div className="space-y-1.5">
                  <p className="font-medium">{r.subscription.planName}</p>
                  <AdminBadge tone={statusTone(r.subscription.status)}>
                    {r.subscription.status}
                  </AdminBadge>
                  {r.subscription.status === "TRIALING" ? (
                    <p className="text-xs text-slate-500">
                      Ends: {formatPeriodEnd(r.subscription.currentPeriodEnd)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <span className="text-slate-400">No plan</span>
              ),
          },
          {
            key: "stats",
            header: "Activity",
            cell: (r) => (
              <span className="text-slate-600 dark:text-slate-400">
                {r.memberCount} staff
              </span>
            ),
          },
          {
            key: "whatsapp",
            header: "WhatsApp",
            cell: (r) =>
              r.whatsapp ? (
                <div className="space-y-1">
                  <p className="font-semibold tabular-nums text-slate-800 dark:text-white">
                    {formatPhoneDisplay(r.whatsapp.phoneNumber)}
                  </p>
                  <AdminBadge tone={statusTone(r.whatsapp.status)}>
                    {r.whatsapp.status.replace(/_/g, " ")}
                  </AdminBadge>
                </div>
              ) : (
                <span className="text-slate-400">No line</span>
              ),
          },
          {
            key: "listing",
            header: "Directory",
            cell: (r) => (
              <AdminBadge tone={r.isDirectoryListed ? "green" : "neutral"}>
                {r.isDirectoryListed ? "Listed" : "Hidden"}
              </AdminBadge>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            cell: (r) => (
              <div className="flex flex-col gap-2">
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTrialPracticeId(r.id)
                    setMessageTone("success")
                    setMessage(
                      `Selected ${r.name} — set optional days and click Start trial.`,
                    )
                  }}
                >
                  Trial…
                </AdminButton>
                <Link
                  href="/admin/whatsapp"
                  className="text-xs font-semibold text-blue-600 hover:underline dark:text-sky-400"
                >
                  WA ops →
                </Link>
                <AdminButton
                  variant={r.isActive ? "danger" : "primary"}
                  size="sm"
                  onClick={() =>
                    void patchPractice(r, { isActive: !r.isActive })
                  }
                >
                  {r.isActive ? "Suspend" : "Activate"}
                </AdminButton>
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void patchPractice(r, {
                      isDirectoryListed: !r.isDirectoryListed,
                    })
                  }
                >
                  {r.isDirectoryListed ? "Hide listing" : "List publicly"}
                </AdminButton>
              </div>
            ),
          },
        ]}
      />
    </AdminShell>
  )
}
