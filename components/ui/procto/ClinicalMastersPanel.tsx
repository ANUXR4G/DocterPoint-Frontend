"use client"

import { useEffect, useMemo, useState } from "react"
import { proctoService } from "@/lib/services/procto"
import {
  ALLERGY_SEVERITIES,
  DEFAULT_CLINICAL_MASTERS,
  mergeClinicalMasters,
  type AllergyMaster,
  type ClinicalMasters,
  type VitalMaster,
} from "@/lib/clinicalMasters"

const BAND_LEGEND = [
  { key: "critical_low", label: "Critical Low", className: "bg-sky-100 text-sky-900" },
  { key: "low", label: "Low", className: "bg-indigo-100 text-indigo-900" },
  { key: "normal", label: "Normal", className: "bg-emerald-100 text-emerald-900" },
  { key: "high", label: "High", className: "bg-rose-100 text-rose-900" },
  { key: "critical_high", label: "Critical High", className: "bg-red-200 text-red-950" },
] as const

const CATEGORIES = ["Food", "Drug", "Respiratory", "Others"] as const

type Props = {
  practiceId: string
  clinicalMasters?: unknown
  onSaved?: (masters: ClinicalMasters) => void
}

function numOrNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function ClinicalMastersPanel({
  practiceId,
  clinicalMasters,
  onSaved,
}: Props) {
  const seeded = useMemo(
    () => mergeClinicalMasters(clinicalMasters ?? DEFAULT_CLINICAL_MASTERS),
    [clinicalMasters],
  )
  // Stable content key — practice dashboard soft-refresh replaces the prop
  // object reference without changing JSON, which used to wipe in-progress Add.
  const mastersKey = useMemo(
    () => JSON.stringify(clinicalMasters ?? null),
    [clinicalMasters],
  )
  const [vitals, setVitals] = useState<VitalMaster[]>(seeded.vitals)
  const [allergies, setAllergies] = useState<AllergyMaster[]>(seeded.allergies)
  const [painScales, setPainScales] = useState<string[]>(seeded.painScales)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    const next = mergeClinicalMasters(clinicalMasters ?? DEFAULT_CLINICAL_MASTERS)
    setVitals(next.vitals)
    setAllergies(next.allergies)
    setPainScales(next.painScales)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when content changes
  }, [mastersKey])

  async function save() {
    setBusy(true)
    setError("")
    setMessage("")
    const payload: ClinicalMasters = {
      vitals,
      allergies: allergies.filter((a) => a.name.trim()),
      painScales: painScales.map((s) => s.trim()).filter(Boolean),
    }
    const res = await proctoService.updatePracticeProfile(practiceId, {
      clinicalMasters: payload,
    })
    setBusy(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not save clinical masters.")
      return
    }
    setMessage("Clinical masters saved.")
    onSaved?.(payload)
  }

  function resetDefaults() {
    const d = mergeClinicalMasters(null)
    setVitals(d.vitals)
    setAllergies(d.allergies)
    setPainScales(d.painScales)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Clinical masters
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            Vital thresholds and allergy catalog used on appointment visits.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetDefaults}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold dark:border-neutral-600"
          >
            Reset defaults
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-semibold text-[var(--theme-primary-foreground)] hover:bg-[var(--theme-primary-hover)] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save masters"}
          </button>
        </div>
      </div>

      {message ? (
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
            Vital master
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {BAND_LEGEND.map((b) => (
              <span
                key={b.key}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${b.className}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
              <tr>
                <th className="px-3 py-2">Vital</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Crit. low</th>
                <th className="px-3 py-2">Low</th>
                <th className="px-3 py-2">Normal min</th>
                <th className="px-3 py-2">Normal max</th>
                <th className="px-3 py-2">High</th>
                <th className="px-3 py-2">Crit. high</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {vitals.map((v, idx) => (
                <tr key={v.key}>
                  <td className="px-3 py-2 font-semibold">
                    {v.label}
                    {v.derived ? (
                      <span className="ml-1 text-xs font-normal opacity-60">
                        (auto)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs opacity-70">{v.unit}</td>
                  {(
                    [
                      "criticalLow",
                      "low",
                      "normalMin",
                      "normalMax",
                      "high",
                      "criticalHigh",
                    ] as const
                  ).map((field) => (
                    <td key={field} className="px-3 py-2">
                      <input
                        type="number"
                        step="any"
                        disabled={Boolean(v.derived)}
                        value={v[field] ?? ""}
                        onChange={(e) => {
                          const next = [...vitals]
                          next[idx] = {
                            ...v,
                            [field]: numOrNull(e.target.value),
                          }
                          setVitals(next)
                        }}
                        className="w-24 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-600"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
            Allergy master
          </h3>
          <button
            type="button"
            onClick={() =>
              setAllergies((prev) => [
                { category: "Food", name: "", description: "" },
                ...prev,
              ])
            }
            className="rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-primary-foreground)] hover:bg-[var(--theme-primary-hover)]"
          >
            Add allergy
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
              <tr>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {allergies.map((a, idx) => (
                <tr key={`${a.category}-${a.name}-${idx}`}>
                  <td className="px-3 py-2">
                    <select
                      value={a.category}
                      onChange={(e) => {
                        const next = [...allergies]
                        next[idx] = { ...a, category: e.target.value }
                        setAllergies(next)
                      }}
                      className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-600"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={a.name}
                      onChange={(e) => {
                        const next = [...allergies]
                        next[idx] = { ...a, name: e.target.value }
                        setAllergies(next)
                      }}
                      className="w-full min-w-[140px] rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={a.description}
                      onChange={(e) => {
                        const next = [...allergies]
                        next[idx] = { ...a, description: e.target.value }
                        setAllergies(next)
                      }}
                      className="w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-600"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      aria-label="Remove allergy"
                      onClick={() =>
                        setAllergies((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">
          Severity options on visits: {ALLERGY_SEVERITIES.join(", ")}.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
          Pain scales
        </h3>
        <div className="space-y-2">
          {painScales.map((s, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                value={s}
                onChange={(e) => {
                  const next = [...painScales]
                  next[idx] = e.target.value
                  setPainScales(next)
                }}
                className="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-600"
              />
              <button
                type="button"
                onClick={() =>
                  setPainScales((prev) => prev.filter((_, i) => i !== idx))
                }
                className="text-sm text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPainScales((prev) => ["", ...prev])}
            className="rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-primary-foreground)] hover:bg-[var(--theme-primary-hover)]"
          >
            Add scale
          </button>
        </div>
      </section>
    </div>
  )
}
