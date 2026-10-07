"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  Activity,
  LineChart,
  Smile,
} from "lucide-react"
import { dashboardPortalRoot } from "@/lib/portalRoot"
import {
  optionsForTab,
  PAIN_TOOL_TABS,
  scaleNameForTab,
  type PainToolOption,
  type PainToolTab,
  WONG_BAKER_OPTIONS,
} from "@/lib/painAssessmentTool"

export type PainAssessmentSelection = {
  scale: string
  score: string
  label: string
  tab: PainToolTab
}

type Props = {
  open: boolean
  initialTab?: PainToolTab
  initialScore?: string
  onClose: () => void
  onSave: (selection: PainAssessmentSelection) => void
}

const ACCENT = "#0D9488"
const SLIDER_BLUE = "#3B82F6"
const SLIDER_TRACK = "#BFDBFE"

/** Horizontal 1–10 linear pain slider (screenshot-matched). */
function LinearPainSlider({
  value,
  onChange,
}: {
  value: number | null
  onChange: (n: number) => void
}) {
  const n = value ?? null
  const pct = n == null ? 0 : ((n - 1) / 9) * 100

  return (
    <div className="mx-auto w-full max-w-2xl px-2 pt-4 pb-2">
      <div className="relative px-1">
        {/* Track */}
        <div className="relative h-5">
          <div
            className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
            style={{ backgroundColor: SLIDER_TRACK }}
          />
          <div
            className="absolute left-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full"
            style={{
              width: n == null ? 0 : `${pct}%`,
              backgroundColor: SLIDER_BLUE,
            }}
          />
          {/* Invisible range for drag */}
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={n ?? 1}
            aria-label="Linear pain scale 1 to 10"
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 z-10 w-full cursor-pointer appearance-none bg-transparent
              [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent
              [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5
              [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0
              [&::-moz-range-thumb]:bg-transparent"
          />
          {/* Visible thumb */}
          {n != null ? (
            <div
              className="pointer-events-none absolute top-1/2 z-20 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm"
              style={{
                left: `${pct}%`,
                backgroundColor: SLIDER_BLUE,
              }}
            />
          ) : null}
        </div>
        {/* Number labels */}
        <div className="mt-3 flex justify-between">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => {
            const active = n === num
            return (
              <button
                key={num}
                type="button"
                onClick={() => onChange(num)}
                className={`w-7 text-center transition-all ${
                  active
                    ? "text-base font-bold text-neutral-700 dark:text-neutral-100"
                    : "text-sm font-medium text-neutral-400 hover:text-neutral-600 dark:text-neutral-500"
                }`}
              >
                {num}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Expressive Wong-Baker-style face icons (Mild → Worst). */
function WongBakerFace({
  optionId,
  color,
  size = 56,
}: {
  optionId: string
  color: string
  size?: number
}) {
  const common = {
    viewBox: "0 0 64 64",
    width: size,
    height: size,
    "aria-hidden": true as const,
  }

  switch (optionId) {
    case "mild":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="30" fill={color} />
          <circle cx="22" cy="26" r="3.2" fill="#fff" />
          <circle cx="42" cy="26" r="3.2" fill="#fff" />
          <path
            d="M20 38c4 8 20 8 24 0"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )
    case "moderate":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="30" fill={color} />
          <circle cx="22" cy="26" r="3.2" fill="#fff" />
          <circle cx="42" cy="26" r="3.2" fill="#fff" />
          <path
            d="M20 40h24"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )
    case "moderate-high":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="30" fill={color} />
          <circle cx="22" cy="27" r="3.2" fill="#fff" />
          <circle cx="42" cy="27" r="3.2" fill="#fff" />
          <path
            d="M18 24c2-2 6-2 8 0M38 24c2-2 6-2 8 0"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M22 44c3-5 17-5 20 0"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )
    case "severe":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="30" fill={color} />
          <circle cx="22" cy="28" r="3.4" fill="#fff" />
          <circle cx="42" cy="28" r="3.4" fill="#fff" />
          <path
            d="M17 22c3-3 8-2 10 1M37 23c2-3 7-3 10 0"
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M20 48c4-10 20-10 24 0"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )
    case "worst":
    default:
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="30" fill={color} />
          <circle cx="22" cy="28" r="3.5" fill="#fff" />
          <circle cx="42" cy="28" r="3.5" fill="#fff" />
          <path
            d="M16 20c4-4 10-3 12 2M36 22c2-4 8-4 12 1"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M18 50c5-14 23-14 28 0"
            fill="none"
            stroke="#fff"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          {/* Tears */}
          <path
            d="M18 34c0 4 2 7 4 8c-3-1-5-4-5-7z"
            fill="#BFDBFE"
            opacity="0.95"
          />
          <path
            d="M46 34c0 4-2 7-4 8c3-1 5-4 5-7z"
            fill="#BFDBFE"
            opacity="0.95"
          />
        </svg>
      )
  }
}

function TabIcon({ tab, active }: { tab: PainToolTab; active: boolean }) {
  const cls = active ? "text-teal-600" : "text-neutral-400"
  if (tab === "linear") return <LineChart className={`size-4 ${cls}`} strokeWidth={2.2} />
  if (tab === "activity") return <Activity className={`size-4 ${cls}`} strokeWidth={2.2} />
  return <Smile className={`size-4 ${cls}`} strokeWidth={2.2} />
}

export default function PainAssessmentToolModal({
  open,
  initialTab = "wong-baker",
  initialScore = "",
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<PainToolTab>(initialTab)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    const opts = optionsForTab(initialTab)
    const hit =
      opts.find((o) => o.score === initialScore || o.label === initialScore) ??
      null
    setSelectedId(hit?.id ?? null)
  }, [open, initialTab, initialScore])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open || !mounted) return null

  const options = optionsForTab(tab)
  const selected: PainToolOption | undefined = options.find(
    (o) => o.id === selectedId,
  )
  const canSave = Boolean(selected)

  const body = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pain-assessment-tool-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-white shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-2">
          <h2
            id="pain-assessment-tool-title"
            className="text-lg font-bold text-neutral-900 dark:text-white"
          >
            Pain Assessment Tool
          </h2>
        </div>

        {/* Scale tabs */}
        <div className="flex flex-wrap gap-1 border-b border-neutral-200 px-4 dark:border-neutral-700">
          {PAIN_TOOL_TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id)
                  setSelectedId(null)
                }}
                className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  active
                    ? "border-teal-600 text-teal-600"
                    : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                <TabIcon tab={t.id} active={active} />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="px-6 py-6">
          {tab === "wong-baker" ? (
            <div className="flex flex-wrap justify-center gap-4">
              {WONG_BAKER_OPTIONS.map((opt) => {
                const active = selectedId === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedId(opt.id)}
                    className={`flex w-[7.5rem] flex-col items-center gap-3 rounded-xl border bg-white px-3 py-4 shadow-sm transition dark:bg-neutral-800 ${
                      active
                        ? "border-teal-500 ring-2 ring-teal-400/50"
                        : "border-neutral-200 hover:border-teal-300 dark:border-neutral-600"
                    }`}
                  >
                    <WongBakerFace
                      optionId={opt.id}
                      color={opt.color || ACCENT}
                      size={58}
                    />
                    <span className="text-center text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : tab === "linear" ? (
            <LinearPainSlider
              value={
                selectedId && /^\d+$/.test(selectedId)
                  ? Number(selectedId)
                  : null
              }
              onChange={(num) => setSelectedId(String(num))}
            />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-3">
              {options.map((opt) => {
                const active = selectedId === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedId(opt.id)}
                    className={`rounded-full border px-5 py-2.5 text-sm font-medium transition ${
                      active
                        ? "border-teal-500 bg-teal-50 text-teal-800 ring-2 ring-teal-400/40 dark:bg-teal-950/40 dark:text-teal-100"
                        : "border-transparent bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-4 dark:border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-bold uppercase tracking-wide text-teal-600 hover:text-teal-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              if (!selected) return
              onSave({
                scale: scaleNameForTab(tab),
                score: selected.score,
                label: selected.label,
                tab,
              })
            }}
            className={`rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition ${
              canSave
                ? "bg-teal-600 hover:bg-teal-700"
                : "cursor-not-allowed bg-neutral-300 dark:bg-neutral-700"
            }`}
          >
            Save Selection
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(body, dashboardPortalRoot())
}
