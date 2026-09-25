"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import { formatPracticeDateTime } from "@/lib/practiceTime"
import { proctoService } from "@/lib/services/procto"

type SupportRow = {
  id: string
  patientPhone: string
  status: string
  updatedAt: string
  supportRequestedAt?: string | null
  supportLabel?: string | null
  agentTransfer?: boolean
}

/**
 * Doctor Activity = WhatsApp Support inbox.
 * Shows patients who tapped Talk to Support / Agent (not booking notifications).
 */
export default function DoctorActivityHub() {
  const dash = usePracticeDashboard()
  const practiceId = dash.practiceId
  const [rows, setRows] = useState<SupportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!practiceId) return
    try {
      const res = await proctoService.listConversations(practiceId)
      if (res.status === "successful" && Array.isArray(res.data)) {
        const all = res.data as SupportRow[]
        // Support requests first (handed off / agent transfer), then recent others.
        const support = all.filter(
          (r) =>
            r.status === "handed_off" ||
            r.agentTransfer ||
            Boolean(r.supportRequestedAt),
        )
        setRows(support.length ? support : [])
        setError("")
      } else {
        setError(res.message || "Could not load support requests.")
        setRows([])
      }
    } catch {
      setError("Could not load support requests.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) {
      setLoading(false)
      return
    }
    setLoading(true)
    void load()
  }, [practiceId, load])

  useEffect(() => {
    if (!practiceId) return
    if (dash.conversationTick === 0) return
    void load()
  }, [practiceId, dash.conversationTick, load])

  async function setStatus(
    id: string,
    status: "bot_active" | "handed_off" | "closed",
  ) {
    if (!practiceId || busyId) return
    setBusyId(id)
    try {
      const res = await proctoService.setConversationStatus(
        practiceId,
        id,
        status,
      )
      if (res.status === "successful") await load()
      else setError(res.message || "Could not update conversation.")
    } catch {
      setError("Could not update conversation.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${
            dash.liveConnected
              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
              : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              dash.liveConnected ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {dash.liveConnected ? "Live" : "Connecting…"}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Refresh
        </button>
        <Link
          href="/doctor/notifications"
          className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Booking alerts →
        </Link>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/60 sm:p-5">
        <h2 className="dashboard-section-title">WhatsApp support requests</h2>
        <p className="dashboard-section-sub mt-1">
          When a patient taps <strong>Talk to Support / Agent</strong> on
          WhatsApp, the request appears here. Take over to silence the bot,
          then reply from your WhatsApp Business number.
        </p>

        {loading ? (
          <p className="mt-6 text-sm text-neutral-500">Loading…</p>
        ) : error ? (
          <p className="mt-6 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No support requests yet. Ask the patient to open WhatsApp menu and
            choose <strong>4 · Talk to Support / Agent</strong>.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.map((r) => {
              const when =
                r.supportRequestedAt || r.updatedAt
                  ? formatPracticeDateTime(r.supportRequestedAt || r.updatedAt)
                  : "—"
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {r.supportLabel || "Talk to Support / Agent"}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-neutral-700 dark:text-neutral-200">
                      {formatPhoneDisplay(r.patientPhone)}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {when}
                      <span className="mx-1.5 opacity-40">·</span>
                      <span
                        className={
                          r.status === "handed_off"
                            ? "font-semibold text-amber-700 dark:text-amber-300"
                            : ""
                        }
                      >
                        {r.status === "handed_off"
                          ? "Waiting for clinic"
                          : r.status}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.status !== "handed_off" ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void setStatus(r.id, "handed_off")}
                        className="min-h-10 rounded-full border border-neutral-300 px-4 text-xs font-semibold dark:border-neutral-600 disabled:opacity-50"
                      >
                        Take over
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void setStatus(r.id, "bot_active")}
                      className="min-h-10 rounded-full border border-neutral-300 px-4 text-xs font-semibold dark:border-neutral-600 disabled:opacity-50"
                    >
                      Return to bot
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void setStatus(r.id, "closed")}
                      className="min-h-10 rounded-full border border-neutral-300 px-4 text-xs font-semibold opacity-70 dark:border-neutral-600 disabled:opacity-50"
                    >
                      Close
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
