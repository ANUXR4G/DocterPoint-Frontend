"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ALLERGY_SEVERITIES,
  computeBmi,
  mergeClinicalMasters,
  vitalsBand,
  type ClinicalAssessment,
  type ClinicalMasters,
  type VitalBand,
} from "@/lib/clinicalMasters"

const BAND_COLORS: Record<VitalBand, string> = {
  critical_low: "bg-sky-100 border-sky-300",
  low: "bg-indigo-100 border-indigo-300",
  normal: "bg-emerald-100 border-emerald-300",
  high: "bg-rose-100 border-rose-300",
  critical_high: "bg-red-200 border-red-400",
}

const BAND_LEGEND = [
  { key: "critical_low" as const, label: "Critical Low", className: "bg-sky-100" },
  { key: "low" as const, label: "Low", className: "bg-indigo-100" },
  { key: "normal" as const, label: "Normal", className: "bg-emerald-100" },
  { key: "high" as const, label: "High", className: "bg-rose-100" },
  { key: "critical_high" as const, label: "Critical High", className: "bg-red-200" },
]

type PainRow = NonNullable<ClinicalAssessment["pain"]>[number]
type AllergyRow = NonNullable<ClinicalAssessment["allergies"]>[number]

type Props = {
  mastersRaw?: unknown
  value: ClinicalAssessment | null
  readOnly?: boolean
  onChange: (next: ClinicalAssessment) => void
}

function emptyPain(): PainRow {
  return {
    scale: "",
    score: "",
    location: "",
    type: "",
    duration: "",
    frequency: "",
    radiation: "",
  }
}

function emptyAllergy(): AllergyRow {
  return {
    category: "Food",
    name: "",
    severity: "",
    active: "Yes",
    description: "",
  }
}

export default function ClinicalAssessmentPanel({
  mastersRaw,
  value,
  readOnly,
  onChange,
}: Props) {
  const masters: ClinicalMasters = useMemo(
    () => mergeClinicalMasters(mastersRaw),
    [mastersRaw],
  )
  const emptyAssessment = (): ClinicalAssessment => ({
    vitals: { breakfast: null, values: {} },
    pain: [emptyPain()],
    allergies: [emptyAllergy()],
    noKnownAllergies: false,
  })

  const [local, setLocal] = useState<ClinicalAssessment>(
    () => value ?? emptyAssessment(),
  )

  // Sync only when saved content actually changes — silent reloads / new object
  // references must not wipe rows the doctor just Added.
  const valueKey = useMemo(() => JSON.stringify(value ?? null), [value])
  useEffect(() => {
    if (value) setLocal(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content
  }, [valueKey])

  function commit(next: ClinicalAssessment) {
    setLocal(next)
    onChange(next)
  }

  const values = local.vitals?.values ?? {}
  const ht = values.ht ?? null
  const wt = values.wt ?? null
  const bmiAuto = computeBmi(ht, wt)

  function setVital(key: string, raw: string) {
    const n = raw.trim() === "" ? null : Number(raw)
    const nextValues = {
      ...values,
      [key]: n != null && Number.isFinite(n) ? n : null,
    }
    if (key === "ht" || key === "wt") {
      nextValues.bmi = computeBmi(
        key === "ht" ? nextValues.ht ?? null : ht,
        key === "wt" ? nextValues.wt ?? null : wt,
      )
    }
    commit({
      ...local,
      vitals: {
        ...local.vitals,
        breakfast: local.vitals?.breakfast ?? null,
        values: nextValues,
        recordedAt: new Date().toISOString(),
      },
    })
  }

  function setBreakfast(v: boolean) {
    commit({
      ...local,
      vitals: {
        ...local.vitals,
        values: { ...values },
        breakfast: v,
        recordedAt: local.vitals?.recordedAt ?? new Date().toISOString(),
      },
    })
  }

  function setNoKnownAllergies() {
    commit({
      ...local,
      noKnownAllergies: true,
      allergies: [
        {
          category: "Others",
          name: "No known allergy",
          severity: "Not available",
          active: "No",
          description: "No known allergy",
        },
      ],
    })
  }

  const interpretation = useMemo(() => {
    const bands = masters.vitals
      .map((m) => {
        const v = m.key === "bmi" ? (values.bmi ?? bmiAuto) : values[m.key]
        return vitalsBand(v ?? null, m)
      })
      .filter(Boolean) as VitalBand[]
    if (!bands.length) return "—"
    if (bands.some((b) => b === "critical_high" || b === "critical_low")) {
      return "Critical"
    }
    if (bands.some((b) => b === "high" || b === "low")) return "Abnormal"
    return "Normal"
  }, [masters.vitals, values, bmiAuto])

  const categories = useMemo(() => {
    const set = new Set(masters.allergies.map((a) => a.category))
    return Array.from(set)
  }, [masters.allergies])

  return (
    <section className="dashboard-panel !h-auto !space-y-6 !overflow-visible !p-5">
      {/* VITALS */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
            Vitals
          </h2>
          <div className="flex flex-wrap gap-1">
            {BAND_LEGEND.map((b) => (
              <span
                key={b.key}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.className}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Did the patient have breakfast this morning?
            </p>
            <div className="mt-1 flex gap-2">
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setBreakfast(v)}
                  className={`rounded-md border px-3 py-1 text-sm font-semibold ${
                    local.vitals?.breakfast === v
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-neutral-300 dark:border-neutral-600"
                  }`}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-neutral-500">
              Vitals interpretation
            </p>
            <p className="text-sm font-bold text-neutral-900 dark:text-white">
              {interpretation}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
          {masters.vitals.map((m) => {
            const rawVal =
              m.key === "bmi" ? (values.bmi ?? bmiAuto) : values[m.key]
            const band = vitalsBand(rawVal ?? null, m)
            return (
              <label key={m.key} className="block text-xs">
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {m.label} ({m.unit})
                </span>
                <input
                  type="number"
                  step="any"
                  disabled={readOnly || Boolean(m.derived)}
                  value={rawVal ?? ""}
                  placeholder="Enter value"
                  onChange={(e) => setVital(m.key, e.target.value)}
                  className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm ${
                    band ? BAND_COLORS[band] : "border-neutral-300 dark:border-neutral-600"
                  } disabled:opacity-70`}
                />
              </label>
            )
          })}
        </div>
      </div>

      <hr className="border-neutral-200 dark:border-neutral-700" />

      {/* PAIN */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
          Pain assessment
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-1 pr-2">S.No</th>
                <th className="py-1 pr-2">Pain scale</th>
                <th className="py-1 pr-2">Score</th>
                <th className="py-1 pr-2">Location</th>
                <th className="py-1 pr-2">Type</th>
                <th className="py-1 pr-2">Duration</th>
                <th className="py-1 pr-2">Frequency</th>
                <th className="py-1 pr-2">Radiation</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {(local.pain ?? []).map((row, idx) => (
                <tr key={idx}>
                  <td className="py-1 pr-2 align-top">{idx + 1}</td>
                  <td className="py-1 pr-2">
                    <select
                      disabled={readOnly}
                      value={row.scale || ""}
                      onChange={(e) => {
                        const pain = [...(local.pain ?? [])]
                        pain[idx] = { ...row, scale: e.target.value }
                        commit({ ...local, pain })
                      }}
                      className="w-full rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600"
                    >
                      <option value="">Select…</option>
                      {masters.painScales.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  {(
                    [
                      "score",
                      "location",
                      "type",
                      "duration",
                      "frequency",
                      "radiation",
                    ] as const
                  ).map((field) => (
                    <td key={field} className="py-1 pr-2">
                      <input
                        disabled={readOnly}
                        value={row[field] || ""}
                        placeholder={`Enter ${field}`}
                        onChange={(e) => {
                          const pain = [...(local.pain ?? [])]
                          pain[idx] = { ...row, [field]: e.target.value }
                          commit({ ...local, pain })
                        }}
                        className="w-full rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600"
                      />
                    </td>
                  ))}
                  <td className="py-1">
                    {!readOnly ? (
                      <button
                        type="button"
                        aria-label="Remove pain row"
                        onClick={() =>
                          commit({
                            ...local,
                            pain: (local.pain ?? []).filter((_, i) => i !== idx),
                          })
                        }
                        className="text-red-600"
                      >
                        ✕
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={() =>
              commit({
                ...local,
                pain: [emptyPain(), ...(local.pain ?? [])],
              })
            }
            className="mt-2 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            Add pain assessment
          </button>
        ) : null}
      </div>

      <hr className="border-neutral-200 dark:border-neutral-700" />

      {/* ALLERGIES */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
            Allergies
          </h2>
          {!readOnly ? (
            <button
              type="button"
              onClick={setNoKnownAllergies}
              className="rounded-md border border-teal-700 px-3 py-1.5 text-xs font-bold text-teal-800 dark:text-teal-200"
            >
              No Known Allergies
            </button>
          ) : null}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-1 pr-2">S.No</th>
                <th className="py-1 pr-2">Category</th>
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">Severity</th>
                <th className="py-1 pr-2">Active</th>
                <th className="py-1 pr-2">Description</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {(local.allergies ?? []).map((row, idx) => {
                const names = masters.allergies.filter(
                  (a) => a.category === row.category,
                )
                return (
                  <tr key={idx}>
                    <td className="py-1 pr-2 align-top">{idx + 1}</td>
                    <td className="py-1 pr-2">
                      <select
                        disabled={readOnly}
                        value={row.category || ""}
                        onChange={(e) => {
                          const allergies = [...(local.allergies ?? [])]
                          allergies[idx] = {
                            ...row,
                            category: e.target.value,
                            name: "",
                            description: "",
                          }
                          commit({
                            ...local,
                            allergies,
                            noKnownAllergies: false,
                          })
                        }}
                        className="w-full rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600"
                      >
                        <option value="">Select…</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        disabled={readOnly}
                        value={row.name || ""}
                        onChange={(e) => {
                          const hit = names.find((n) => n.name === e.target.value)
                          const allergies = [...(local.allergies ?? [])]
                          allergies[idx] = {
                            ...row,
                            name: e.target.value,
                            description: hit?.description || row.description || "",
                          }
                          commit({
                            ...local,
                            allergies,
                            noKnownAllergies:
                              e.target.value === "No known allergy",
                          })
                        }}
                        className="w-full rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600"
                      >
                        <option value="">Select allergy…</option>
                        {names.map((n) => (
                          <option key={n.name} value={n.name}>
                            {n.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        disabled={readOnly}
                        value={row.severity || ""}
                        onChange={(e) => {
                          const allergies = [...(local.allergies ?? [])]
                          allergies[idx] = { ...row, severity: e.target.value }
                          commit({ ...local, allergies })
                        }}
                        className="w-full rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600"
                      >
                        <option value="">Select…</option>
                        {ALLERGY_SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        disabled={readOnly}
                        value={row.active || ""}
                        onChange={(e) => {
                          const allergies = [...(local.allergies ?? [])]
                          allergies[idx] = { ...row, active: e.target.value }
                          commit({ ...local, allergies })
                        }}
                        className="w-full rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600"
                      >
                        <option value="">Select…</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        disabled={readOnly}
                        value={row.description || ""}
                        onChange={(e) => {
                          const allergies = [...(local.allergies ?? [])]
                          allergies[idx] = {
                            ...row,
                            description: e.target.value,
                          }
                          commit({ ...local, allergies })
                        }}
                        className="w-full rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600"
                      />
                    </td>
                    <td className="py-1">
                      {!readOnly ? (
                        <button
                          type="button"
                          aria-label="Remove allergy"
                          onClick={() =>
                            commit({
                              ...local,
                              allergies: (local.allergies ?? []).filter(
                                (_, i) => i !== idx,
                              ),
                              noKnownAllergies: false,
                            })
                          }
                          className="text-red-600"
                        >
                          ✕
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={() =>
              commit({
                ...local,
                noKnownAllergies: false,
                allergies: [emptyAllergy(), ...(local.allergies ?? [])],
              })
            }
            className="mt-2 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            Add allergy
          </button>
        ) : null}
      </div>
    </section>
  )
}
