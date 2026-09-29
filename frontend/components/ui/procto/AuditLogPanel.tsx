"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import {
  proctoService,
  type AuditAction,
  type AuditEvent,
} from "@/lib/services/procto"
import { PRACTICE_TIMEZONE } from "@/lib/practiceTime"
import { CLINIC_ROLE_LABEL } from "@/lib/quickSlots"

const ACTIONS: Array<[AuditAction | "", string]> = [
  ["", "All actions"],
  ["SLOT_CREATED", "Slots created"],
  ["SLOT_REMOVED", "Slots removed"],
  ["OVERRIDE_CREATED", "Leave & blocks"],
  ["OVERRIDE_REMOVED", "Blocks lifted"],
  ["WALK_IN_ADDED", "Emergency walk-ins"],
  ["PATIENT_REGISTERED", "Patient registrations"],
]

const ACTION_STYLE: Record<AuditAction, string> = {
  SLOT_CREATED:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  SLOT_REMOVED:
    "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100",
  OVERRIDE_CREATED:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  OVERRIDE_REMOVED:
    "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  WALK_IN_ADDED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  PATIENT_REGISTERED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
}

const DOCTOR_ROLES = new Set(["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN"])

function when(iso: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PRACTICE_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  )
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod}`
}

function csvCell(v: unknown) {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const fieldClass =
  "rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"

export default function AuditLogPanel() {
  const { practiceId, memberships } = usePracticeDashboard()
  const [action, setAction] = useState<AuditAction | "">("")
  const [providerId, setProviderId] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [scope, setScope] = useState<"ANY" | "OWN" | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState("")

  const doctors = useMemo(
    () =>
      (memberships[0]?.practice?.members ?? [])
        .filter((m) => DOCTOR_ROLES.has(m.role) && m.userId)
        .map((m) => ({
          id: String(m.userId),
          name: m.user?.name || m.user?.email || "Doctor",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [memberships],
  )
  const doctorName = useMemo(
    () => new Map(doctors.map((d) => [d.id, d.name])),
    [doctors],
  )
  const filters = useMemo(
    () => ({
      action: action || undefined,
      providerId: providerId || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [action, providerId, from, to],
  )

  const load = useCallback(
    async (before?: string) => {
      if (!practiceId) return
      setLoading(true)
      const res = await proctoService.getAuditLog(practiceId, {
        ...filters,
        before,
        limit: 50,
      })
      setLoading(false)
      if (res.status === "successful" && res.data) {
        const page = res.data
        setScope(page.scope)
        setEvents((prev) => (before ? [...prev, ...page.events] : page.events))
        setNext(page.nextBefore)
        setError("")
      } else {
        if (!before) setEvents([])
        setNext(null)
        setError(res.message || "Could not load the audit log.")
      }
    },
    [practiceId, filters],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function exportCsv() {
    if (!practiceId) return
    setExporting(true)
    const rows: AuditEvent[] = []
    let before: string | undefined
    for (let i = 0; i < 20; i++) {
      const res = await proctoService.getAuditLog(practiceId, {
        ...filters,
        before,
        limit: 500,
      })
      if (res.status !== "successful" || !res.data) break
      rows.push(...res.data.events)
      if (!res.data.nextBefore) break
      before = res.data.nextBefore
    }
    setExporting(false)
    const header = ["When", "Action", "By", "Role", "Doctor", "Summary"]
    const lines = [
      header.join(","),
      ...rows.map((e) =>
        [
          when(e.createdAt),
          ACTIONS.find(([a]) => a === e.action)?.[1] ?? e.action,
          e.actorName ?? "",
          (e.actorRole && CLINIC_ROLE_LABEL[e.actorRole]) || e.actorRole || "",
          e.providerId ? (doctorName.get(e.providerId) ?? "") : "",
          e.summary,
        ]
          .map(csvCell)
          .join(","),
      ),
    ]
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs font-semibold">
          Action
          <select
            className={`${fieldClass} mt-1`}
            value={action}
            onChange={(e) => setAction(e.target.value as AuditAction | "")}
          >
            {ACTIONS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {scope === "ANY" && doctors.length > 1 ? (
          <label className="flex flex-col text-xs font-semibold">
            Doctor
            <select
              className={`${fieldClass} mt-1`}
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            >
              <option value="">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col text-xs font-semibold">
          From
          <input
            type="date"
            className={`${fieldClass} mt-1`}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs font-semibold">
          To
          <input
            type="date"
            className={`${fieldClass} mt-1`}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting || !events.length}
          className="ml-auto rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-neutral-600"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {scope === "OWN" ? (
        <p className="text-xs opacity-70">
          Showing actions on your own calendar and actions you took. Clinic
          owners and admins see the whole clinic.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {error}
        </p>
      ) : null}

      {!error && !loading && !events.length ? (
        <p className="rounded-xl border border-neutral-200 px-4 py-6 text-center text-sm opacity-70 dark:border-neutral-700">
          No actions recorded for these filters yet.
        </p>
      ) : null}

      {events.length ? (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/40">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-3">
              <span className="w-40 shrink-0 text-xs tabular-nums opacity-70">
                {when(e.createdAt)}
              </span>
              <span
                className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${ACTION_STYLE[e.action] ?? ""}`}
              >
                {ACTIONS.find(([a]) => a === e.action)?.[1] ?? e.action}
              </span>
              <span className="min-w-[240px] flex-1 text-sm">{e.summary}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {next ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(next)}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-neutral-600"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : loading && !events.length ? (
        <p className="text-sm opacity-60">Loading…</p>
      ) : null}
    </div>
  )
}
