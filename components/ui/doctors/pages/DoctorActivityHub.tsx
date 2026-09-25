"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import CareChatPanel from "@/components/ui/procto/CareChatPanel"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import { formatPracticeDateTime } from "@/lib/practiceTime"
import { getSessionUserId } from "@/lib/sessionUser"
import { proctoService } from "@/lib/services/procto"

type SupportRow = {
  id: string
  patientPhone: string
  status: string
  updatedAt: string
  patientUserId?: string | null
  patientName?: string | null
  supportRequestedAt?: string | null
  supportLabel?: string | null
  agentTransfer?: boolean
}

/**
 * Doctor Support = WhatsApp support chat inbox.
 * Shows patients who tapped Talk to Support / Agent (not booking notifications).
 */
export default function DoctorActivityHub() {
  const dash = usePracticeDashboard()
  const practiceId = dash.practiceId
  const selfId = useMemo(() => getSessionUserId(), [])
  const [rows, setRows] = useState<SupportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!practiceId) return
    try {
      const res = await proctoService.listConversations(practiceId)
      if (res.status === "successful" && Array.isArray(res.data)) {
        const all = res.data as SupportRow[]
        const support = all.filter(
          (r) =>
            r.status === "handed_off" ||
            r.agentTransfer ||
            Boolean(r.supportRequestedAt),
        )
        setRows(support)
        setError("")
        setSelectedId((prev) => {
          if (prev && support.some((r) => r.id === prev)) return prev
          return support[0]?.id ?? null
        })
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

  const selected = rows.find((r) => r.id === selectedId) ?? null

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

  async function openChat(row: SupportRow) {
    setSelectedId(row.id)
    if (row.status !== "handed_off") {
      await setStatus(row.id, "handed_off")
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
        <h2 className="dashboard-section-title">WhatsApp support chat</h2>
        <p className="dashboard-section-sub mt-1">
          When a patient taps <strong>Talk to Support / Agent</strong>, open
          their thread here and message them directly. Replies also go out on
          WhatsApp. The bot stays off until you choose Resume bot.
        </p>

        {loading ? (
          <p className="mt-6 text-sm text-neutral-500">Loading…</p>
        ) : error ? (
          <p className="mt-6 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No support chats yet. Ask the patient to open WhatsApp menu and
            choose <strong>4 · Talk to Support / Agent</strong>.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-700">
              {rows.map((r) => {
                const active = r.id === selectedId
                const when =
                  r.supportRequestedAt || r.updatedAt
                    ? formatPracticeDateTime(
                        r.supportRequestedAt || r.updatedAt,
                      )
                    : "—"
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => void openChat(r)}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-3 text-left transition ${
                        active
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "hover:bg-neutral-50 dark:hover:bg-neutral-800/80"
                      }`}
                    >
                      <span className="text-sm font-semibold">
                        {r.patientName ||
                          r.supportLabel ||
                          "Talk to Support"}
                      </span>
                      <span
                        className={`text-xs tabular-nums ${
                          active ? "opacity-80" : "text-neutral-500"
                        }`}
                      >
                        {formatPhoneDisplay(r.patientPhone)}
                      </span>
                      <span
                        className={`text-[11px] ${
                          active ? "opacity-70" : "text-neutral-400"
                        }`}
                      >
                        {when}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="min-w-0 space-y-3">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {selected.patientName || "Patient"}
                      </p>
                      <p className="text-xs tabular-nums text-neutral-500">
                        {formatPhoneDisplay(selected.patientPhone)}
                        <span className="mx-1.5 opacity-40">·</span>
                        Chat open — bot parked
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === selected.id}
                        onClick={() =>
                          void setStatus(selected.id, "bot_active")
                        }
                        className="min-h-9 rounded-full border border-neutral-300 px-3 text-xs font-semibold text-neutral-600 dark:border-neutral-600 dark:text-neutral-300 disabled:opacity-50"
                        title="Hand the WhatsApp thread back to the booking bot"
                      >
                        Resume bot
                      </button>
                      <button
                        type="button"
                        disabled={busyId === selected.id}
                        onClick={() => void setStatus(selected.id, "closed")}
                        className="min-h-9 rounded-full border border-neutral-300 px-3 text-xs font-semibold opacity-70 dark:border-neutral-600 disabled:opacity-50"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  {selfId && selected.patientUserId ? (
                    <CareChatPanel
                      className="min-h-[22rem]"
                      selfUserId={selfId}
                      peerUserId={selected.patientUserId}
                      peerName={
                        selected.patientName ||
                        formatPhoneDisplay(selected.patientPhone)
                      }
                      subtitle="Your messages are delivered on WhatsApp. Patient replies appear here."
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-sm text-neutral-500 dark:border-neutral-700">
                      {selfId
                        ? "This WhatsApp number is not linked to a registered patient account yet. Ask them to Register on the bot, then refresh."
                        : "Sign in again to open the chat panel."}
                    </div>
                  )}
                </>
              ) : (
                <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
                  Select a patient on the left to start chatting.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
