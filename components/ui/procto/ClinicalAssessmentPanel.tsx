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
import {
  PAIN_DURATION_PRESETS,
  PAIN_DURATION_UNITS,
  PAIN_FREQUENCIES,
  PAIN_LOCATION_GROUPS,
  PAIN_RADIATIONS,
  PAIN_TYPES,
  parseCustomDuration,
  type PainChoice,
} from "@/lib/painCatalog"
import { formatPracticeDateTime } from "@/lib/practiceTime"
import {
  painToolTabForScale,
  shouldOpenPainAssessmentTool,
  type PainToolTab,
} from "@/lib/painAssessmentTool"
import PainAssessmentToolModal from "@/components/ui/procto/PainAssessmentToolModal"

/** Full-field fill + border (do not mix with a white base bg — Tailwind order fights). */
const BAND_COLORS: Record<VitalBand, string> = {
  critical_low:
    "border-2 border-sky-400 bg-sky-100 text-sky-950 placeholder:text-sky-700/50 dark:border-sky-500 dark:bg-sky-950/70 dark:text-sky-100 dark:placeholder:text-sky-300/40",
  low: "border-2 border-indigo-400 bg-indigo-100 text-indigo-950 placeholder:text-indigo-700/50 dark:border-indigo-500 dark:bg-indigo-950/70 dark:text-indigo-100 dark:placeholder:text-indigo-300/40",
  normal:
    "border-2 border-emerald-400 bg-emerald-100 text-emerald-950 placeholder:text-emerald-700/50 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-100 dark:placeholder:text-emerald-300/40",
  high: "border-2 border-rose-400 bg-rose-100 text-rose-950 placeholder:text-rose-700/50 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-100 dark:placeholder:text-rose-300/40",
  critical_high:
    "border-2 border-red-500 bg-red-200 text-red-950 placeholder:text-red-700/50 dark:border-red-400 dark:bg-red-950/70 dark:text-red-100 dark:placeholder:text-red-300/40",
}

const FIELD_INPUT =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500"

const BAND_LEGEND = [
  {
    key: "critical_low" as const,
    label: "Critical Low",
    className: "bg-sky-100 text-sky-950 dark:bg-sky-950/60 dark:text-sky-100",
  },
  {
    key: "low" as const,
    label: "Low",
    className: "bg-indigo-100 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100",
  },
  {
    key: "normal" as const,
    label: "Normal",
    className:
      "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100",
  },
  {
    key: "high" as const,
    label: "High",
    className: "bg-rose-100 text-rose-950 dark:bg-rose-950/50 dark:text-rose-100",
  },
  {
    key: "critical_high" as const,
    label: "Critical High",
    className: "bg-red-200 text-red-950 dark:bg-red-950/60 dark:text-red-100",
  },
]

type PainRow = NonNullable<ClinicalAssessment["pain"]>[number]
type AllergyRow = NonNullable<ClinicalAssessment["allergies"]>[number]

export type ClinicalVersion = {
  id: string
  savedAt: string
  actorName?: string | null
  snapshot: ClinicalAssessment
}

type Props = {
  mastersRaw?: unknown
  value: ClinicalAssessment | null
  versions?: ClinicalVersion[]
  readOnly?: boolean
  onChange: (next: ClinicalAssessment) => void
}

function versionSummary(snapshot: ClinicalAssessment): string {
  const values = snapshot.vitals?.values ?? {}
  const vitalBits = Object.entries(values)
    .filter(([, v]) => v != null && v !== ("" as unknown))
    .map(([k, v]) => `${k} ${v}`)
  const painBits = (snapshot.pain ?? [])
    .map((row) =>
      [row.scale, row.score, row.location, row.type, row.duration, row.frequency, row.radiation]
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean)
  const allergyBits = (snapshot.allergies ?? [])
    .map((row) => row.name)
    .filter(Boolean)
  return [
    vitalBits.length ? `Vitals: ${vitalBits.join(", ")}` : "",
    painBits.length ? `Pain: ${painBits.join(" · ")}` : "",
    allergyBits.length ? `Allergies: ${allergyBits.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
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

function withCurrent(current: string, options: string[]) {
  return current && !options.includes(current) ? [current, ...options] : options
}

function ChoiceSelect({
  value,
  choices,
  placeholder,
  disabled,
  onPick,
}: {
  value: string
  choices: PainChoice[]
  placeholder: string
  disabled?: boolean
  onPick: (next: string) => void
}) {
  const labels = choices.map((c) => c.label)
  return (
    <select
      disabled={disabled}
      value={value}
      title={choices.find((c) => c.label === value)?.hint}
      onChange={(e) => onPick(e.target.value)}
      className={FIELD_INPUT}
    >
      <option value="">{placeholder}</option>
      {withCurrent(value, labels).map((label) => (
        <option
          key={label}
          value={label}
          title={choices.find((c) => c.label === label)?.hint}
        >
          {label}
        </option>
      ))}
    </select>
  )
}

export default function ClinicalAssessmentPanel({
  mastersRaw,
  value,
  versions = [],
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
  const [painTool, setPainTool] = useState<{
    idx: number
    tab: PainToolTab
  } | null>(null)
  const [openVersionId, setOpenVersionId] = useState<string | null>(null)

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

  const savedStamp =
    value?.savedAt ||
    versions[0]?.savedAt ||
    value?.vitals?.recordedAt ||
    null
  const savedLabel = savedStamp ? formatPracticeDateTime(savedStamp) : ""

  function setPainField(
    idx: number,
    row: PainRow,
    field: keyof PainRow,
    next: string,
  ) {
    const pain = [...(local.pain ?? [])]
    pain[idx] = { ...row, [field]: next }
    commit({ ...local, pain })
  }

  return (
    <section className="dashboard-panel !h-auto !space-y-6 !overflow-visible !p-5">
      {savedLabel ? (
        <div className="text-xs text-neutral-600 dark:text-neutral-300">
          <p className="font-semibold text-neutral-800 dark:text-neutral-100">
            Saved {savedLabel}
            {versions[0]?.actorName ? ` · ${versions[0].actorName}` : ""}
          </p>
          {versions.length > 1 ? (
            <ul className="mt-1 space-y-1">
              {versions.slice(1).map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="font-semibold text-[var(--theme-primary)] hover:underline"
                    onClick={() =>
                      setOpenVersionId((cur) => (cur === v.id ? null : v.id))
                    }
                  >
                    Earlier save {formatPracticeDateTime(v.savedAt)}
                    {v.actorName ? ` · ${v.actorName}` : ""}
                  </button>
                  {openVersionId === v.id ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-neutral-600 dark:text-neutral-300">
                      {versionSummary(v.snapshot)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {/* VITALS */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-900 dark:text-white">
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
                      ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-[var(--theme-primary-foreground)]"
                      : "border-neutral-300 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
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
                  className={`mt-1 w-full rounded-md px-2 py-1.5 text-sm disabled:opacity-70 ${
                    band
                      ? BAND_COLORS[band]
                      : "border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500"
                  }`}
                />
              </label>
            )
          })}
        </div>
      </div>

      <hr className="border-neutral-200 dark:border-neutral-700" />

      {/* PAIN */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-900 dark:text-white">
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
                        const nextScale = e.target.value
                        const pain = [...(local.pain ?? [])]
                        pain[idx] = { ...row, scale: nextScale }
                        commit({ ...local, pain })
                        const tab = painToolTabForScale(nextScale)
                        if (tab && !readOnly) {
                          setPainTool({ idx, tab })
                        }
                      }}
                      className={FIELD_INPUT}
                    >
                      <option value="">Select…</option>
                      {masters.painScales.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    {shouldOpenPainAssessmentTool(row.scale || "") &&
                    !readOnly ? (
                      <button
                        type="button"
                        onClick={() => {
                          const tab =
                            painToolTabForScale(row.scale || "") ?? "wong-baker"
                          setPainTool({ idx, tab })
                        }}
                        className={`${FIELD_INPUT} cursor-pointer text-left hover:border-teal-400`}
                        title="Open Pain Assessment Tool"
                      >
                        {row.score || "Select with tool…"}
                      </button>
                    ) : (
                      <input
                        disabled={readOnly}
                        value={row.score || ""}
                        placeholder="Score"
                        onChange={(e) =>
                          setPainField(idx, row, "score", e.target.value)
                        }
                        className={FIELD_INPUT}
                      />
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      disabled={readOnly}
                      value={row.location || ""}
                      onChange={(e) =>
                        setPainField(idx, row, "location", e.target.value)
                      }
                      className={FIELD_INPUT}
                    >
                      <option value="">Location…</option>
                      {row.location &&
                      !PAIN_LOCATION_GROUPS.some((g) =>
                        g.options.includes(row.location || ""),
                      ) ? (
                        <option value={row.location}>{row.location}</option>
                      ) : null}
                      {PAIN_LOCATION_GROUPS.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <ChoiceSelect
                      value={row.type || ""}
                      choices={PAIN_TYPES}
                      placeholder="Type…"
                      disabled={readOnly}
                      onPick={(next) => setPainField(idx, row, "type", next)}
                    />
                  </td>
                  <td className="min-w-[9rem] py-1 pr-2">
                    <select
                      disabled={readOnly}
                      value={
                        PAIN_DURATION_PRESETS.includes(row.duration || "")
                          ? row.duration
                          : ""
                      }
                      onChange={(e) =>
                        setPainField(idx, row, "duration", e.target.value)
                      }
                      className={FIELD_INPUT}
                    >
                      <option value="">Duration…</option>
                      {PAIN_DURATION_PRESETS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 flex gap-1">
                      <input
                        disabled={readOnly}
                        inputMode="numeric"
                        value={parseCustomDuration(row.duration || "")?.n ?? ""}
                        placeholder="No."
                        onChange={(e) => {
                          const n = e.target.value.replace(/\D/g, "").slice(0, 3)
                          const unit =
                            parseCustomDuration(row.duration || "")?.unit ??
                            "Days"
                          setPainField(
                            idx,
                            row,
                            "duration",
                            n ? `${n} ${unit}` : "",
                          )
                        }}
                        className={`${FIELD_INPUT} w-14`}
                      />
                      <select
                        disabled={readOnly}
                        value={
                          parseCustomDuration(row.duration || "")?.unit ?? "Days"
                        }
                        onChange={(e) => {
                          const n =
                            parseCustomDuration(row.duration || "")?.n ?? ""
                          if (!n) return
                          setPainField(
                            idx,
                            row,
                            "duration",
                            `${n} ${e.target.value}`,
                          )
                        }}
                        className={FIELD_INPUT}
                      >
                        {PAIN_DURATION_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="py-1 pr-2">
                    <ChoiceSelect
                      value={row.frequency || ""}
                      choices={PAIN_FREQUENCIES}
                      placeholder="Frequency…"
                      disabled={readOnly}
                      onPick={(next) =>
                        setPainField(idx, row, "frequency", next)
                      }
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <ChoiceSelect
                      value={row.radiation || ""}
                      choices={PAIN_RADIATIONS}
                      placeholder="Radiation…"
                      disabled={readOnly}
                      onPick={(next) =>
                        setPainField(idx, row, "radiation", next)
                      }
                    />
                  </td>
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
            className="mt-2 rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-primary-foreground)] hover:bg-[var(--theme-primary-hover)]"
          >
            Add pain assessment
          </button>
        ) : null}

        <PainAssessmentToolModal
          open={painTool != null}
          initialTab={painTool?.tab ?? "wong-baker"}
          initialScore={
            painTool != null
              ? local.pain?.[painTool.idx]?.score || ""
              : ""
          }
          onClose={() => setPainTool(null)}
          onSave={(sel) => {
            if (painTool == null) return
            const pain = [...(local.pain ?? [])]
            const row = pain[painTool.idx]
            if (!row) {
              setPainTool(null)
              return
            }
            // Keep the clinic scale label if it already maps to this tool tab.
            const scale =
              painToolTabForScale(row.scale || "") === sel.tab
                ? row.scale
                : masters.painScales.find(
                    (s) => painToolTabForScale(s) === sel.tab,
                  ) ?? sel.scale
            pain[painTool.idx] = {
              ...row,
              scale,
              score: sel.score,
            }
            commit({ ...local, pain })
            setPainTool(null)
          }}
        />
      </div>

      <hr className="border-neutral-200 dark:border-neutral-700" />

      {/* ALLERGIES */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-900 dark:text-white">
            Allergies
          </h2>
          {!readOnly ? (
            <button
              type="button"
              onClick={setNoKnownAllergies}
              className="rounded-md border border-[var(--theme-primary)] px-3 py-1.5 text-xs font-bold text-[var(--theme-primary)]"
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
                        className={FIELD_INPUT}
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
                        className={FIELD_INPUT}
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
                        className={FIELD_INPUT}
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
                        className={FIELD_INPUT}
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
                        className={FIELD_INPUT}
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
            className="mt-2 rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-primary-foreground)] hover:bg-[var(--theme-primary-hover)]"
          >
            Add allergy
          </button>
        ) : null}
      </div>
    </section>
  )
}
