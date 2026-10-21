"use client"

import { useState } from "react"
import {
  defaultMedicineStartDate,
  medicineEndDate,
  medicineWithStartDate,
} from "@/lib/medicineDates"
import MedicineAutocomplete from "./MedicineAutocomplete"
import InstructionCombobox from "./InstructionCombobox"
import FavoriteOrderSetModal from "./FavoriteOrderSetModal"
import type { MedicineMasterItem } from "@/lib/medicineMaster"

export type VisitMedicine = {
  name: string
  amount?: string
  times?: string[]
  strength?: string
  route?: string
  dose?: string
  doseUnit?: string
  frequency?: string
  duration?: string
  durationUnit?: string
  startDate?: string
  endDate?: string
  instruction?: string
  favourite?: boolean
}

export const emptyMedicineDraft = (): VisitMedicine => ({
  name: "",
  strength: "",
  route: "",
  dose: "",
  doseUnit: "",
  frequency: "",
  duration: "",
  durationUnit: "",
  startDate: defaultMedicineStartDate(),
  endDate: "",
  instruction: "",
  favourite: false,
})

const ROUTES = [
  "Oral",
  "Topical",
  "Intravenous",
  "Intramuscular",
  "Subcutaneous",
  "Inhalation",
  "Nasal",
  "Eye",
  "Ear",
  "Rectal",
  "Sublingual",
]

const DOSE_UNITS = [
  "mg",
  "mcg",
  "g",
  "ml",
  "tablet",
  "capsule",
  "drop",
  "puff",
  "unit",
  "IU",
]

const FREQUENCIES = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Four times daily",
  "At bedtime",
  "As needed",
  "Every 6 hours",
  "Every 8 hours",
  "Every 12 hours",
  "Weekly",
]

const DURATION_UNITS = ["Day", "Week", "Month"]

const SCHEDULE_FIELDS = new Set(["duration", "durationUnit", "startDate"])

/** Apply one edited field on a saved medicine and keep dose, timing, and end date in step. */
export function editedVisitMedicine(
  row: VisitMedicine,
  patch: Partial<VisitMedicine>,
  commit: boolean,
): VisitMedicine {
  const next: VisitMedicine = { ...row, ...patch }
  if ("startDate" in patch && !String(patch.startDate || "").trim()) {
    next.startDate = row.startDate
  }
  if (commit) {
    const name = (next.name || "").trim()
    next.name = name || row.name
    next.strength = next.strength?.trim() || undefined
    next.route = next.route?.trim() || undefined
    next.dose = next.dose?.trim() || undefined
    next.doseUnit = next.doseUnit?.trim() || undefined
    next.frequency = next.frequency?.trim() || undefined
    next.duration = next.duration?.trim() || undefined
    next.durationUnit = next.durationUnit?.trim() || undefined
    next.instruction = next.instruction?.trim() || undefined
    next.startDate = next.startDate?.trim() || row.startDate
    next.endDate = next.endDate?.trim() || undefined
  }
  const keys = Object.keys(patch)
  const reschedule =
    keys.some((key) => SCHEDULE_FIELDS.has(key)) &&
    !(keys.length === 1 && keys[0] === "endDate")
  if (reschedule) {
    const scheduled = medicineWithStartDate(next, next.startDate || "")
    next.startDate = scheduled.startDate
    next.endDate =
      medicineEndDate(
        scheduled.startDate || "",
        next.duration || "",
        next.durationUnit || "",
      ) || undefined
  }
  if ("dose" in patch || "doseUnit" in patch) {
    const amount = [next.dose, next.doseUnit].filter(Boolean).join(" ")
    next.amount = amount || undefined
  }
  if ("frequency" in patch) {
    next.times = next.frequency ? [next.frequency] : undefined
  }
  return next
}

export function visitMedicineSignature(row: VisitMedicine): string {
  return [
    row.name || "",
    row.strength || "",
    row.route || "",
    row.dose || "",
    row.doseUnit || "",
    row.frequency || "",
    row.duration || "",
    row.durationUnit || "",
    row.startDate || "",
    row.endDate || "",
    row.instruction || "",
    row.amount || "",
    (row.times || []).join(","),
  ].join("\u001f")
}

export function medicineFromDraft(draft: VisitMedicine): VisitMedicine | null {
  const name = draft.name.trim()
  if (!name) return null
  const dose = draft.dose?.trim() || ""
  const doseUnit = draft.doseUnit?.trim() || ""
  const frequency = draft.frequency?.trim() || ""
  const amount = [dose, doseUnit].filter(Boolean).join(" ")
  const startDate = draft.startDate?.trim() || defaultMedicineStartDate()
  const endDate =
    medicineEndDate(startDate, draft.duration || "", draft.durationUnit || "") ||
    draft.endDate?.trim() ||
    undefined
  return {
    name,
    strength: draft.strength?.trim() || undefined,
    route: draft.route?.trim() || undefined,
    dose: dose || undefined,
    doseUnit: doseUnit || undefined,
    frequency: frequency || undefined,
    duration: draft.duration?.trim() || undefined,
    durationUnit: draft.durationUnit?.trim() || undefined,
    startDate,
    endDate,
    instruction: draft.instruction?.trim() || undefined,
    amount: amount || undefined,
    times: frequency ? [frequency] : undefined,
  }
}

function shownDose(m: VisitMedicine) {
  return m.dose?.trim() || m.amount?.trim() || ""
}

function shownFrequency(m: VisitMedicine) {
  return m.frequency?.trim() || (m.times?.length ? m.times.join(", ") : "")
}

function optionsWithCurrent(options: string[], current: string) {
  if (current && !options.includes(current)) return [current, ...options]
  return options
}

function shownDate(value?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() || "")
  if (!match) return value?.trim() || ""
  return `${match[3]}/${match[2]}/${match[1]}`
}

const th =
  "whitespace-nowrap border border-neutral-200 bg-neutral-50 px-2 py-2 text-left text-[11px] font-semibold text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:!text-neutral-100"
const td =
  "border border-neutral-200 px-1 py-1 align-middle text-xs text-neutral-900 dark:border-neutral-600 dark:!text-neutral-100"
const field =
  "w-full min-w-[4.75rem] rounded border border-neutral-200 bg-white px-1.5 py-1 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-neutral-500 dark:bg-neutral-900 dark:!text-neutral-100 dark:placeholder:!text-neutral-400 dark:[color-scheme:dark]"
const dateField =
  "w-full min-w-[11rem] rounded border border-neutral-200 bg-white px-1.5 py-1 text-xs text-neutral-900 outline-none dark:border-neutral-500 dark:bg-neutral-900 dark:!text-neutral-100 dark:[color-scheme:dark]"

export default function MedicineEntryTable({
  rows,
  draft,
  locked,
  onDraft,
  onAdd,
  onRemove,
  onEdit,
  onToggleFavourite,
  onAddMedicines,
  practiceId,
}: {
  rows: VisitMedicine[]
  draft: VisitMedicine
  locked: boolean
  onDraft: (next: VisitMedicine) => void
  onAdd: () => void
  onRemove: (index: number) => void
  /** Saved row: update any field. Text commits when the doctor leaves the field. */
  onEdit?: (
    index: number,
    patch: Partial<VisitMedicine>,
    commit: boolean,
  ) => void
  /** Toggle favourite status of a medicine. */
  onToggleFavourite?: (index: number, favourite: boolean) => void
  /** Bulk append multiple medicines, e.g. from favorites or an order set. */
  onAddMedicines?: (medicines: VisitMedicine[]) => void
  /** Practice ID for practice-specific order sets and clinical masters. */
  practiceId?: string
}) {
  const [showOrderModal, setShowOrderModal] = useState(false)
  function set<K extends keyof VisitMedicine>(key: K, value: string | boolean) {
    const next: VisitMedicine = { ...draft, [key]: value }
    if (key === "duration" || key === "durationUnit" || key === "startDate") {
      const scheduled = medicineWithStartDate(next, next.startDate || "")
      next.startDate = scheduled.startDate
      if (scheduled.endDate) next.endDate = scheduled.endDate
      else if (key === "duration" || key === "durationUnit") next.endDate = ""
    }
    onDraft(next)
  }

  function handleMasterSelect(med: MedicineMasterItem) {
    const next: VisitMedicine = {
      ...draft,
      name: med.name,
      strength: draft.strength || med.strength || "",
      route: draft.route || med.route || "",
      dose: draft.dose || med.dose || "",
      doseUnit: draft.doseUnit || med.doseUnit || "",
      frequency: draft.frequency || med.frequency || "",
      duration: draft.duration || med.duration || "",
      durationUnit: draft.durationUnit || med.durationUnit || "",
      instruction: draft.instruction || med.instruction || "",
    }
    if (next.duration && next.durationUnit && next.startDate) {
      const scheduled = medicineWithStartDate(next, next.startDate)
      if (scheduled.endDate) next.endDate = scheduled.endDate
    }
    onDraft(next)
  }

  return (
    <div className="space-y-2">
      {/* Top toolbar on top of medicine box */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            {rows.length} {rows.length === 1 ? "medicine" : "medicines"} prescribed
          </span>
        </div>
        {!locked && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOrderModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-xs hover:bg-amber-100 hover:border-amber-400 active:scale-95 transition-all dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/60 cursor-pointer"
              title="Order from Favorite medicines or apply complete Order Sets"
            >
              <span className="text-amber-500 text-sm">⭐</span>
              <span>Order from Favorites &amp; Order Sets</span>
            </button>
          </div>
        )}
      </div>

      <div className="chart-x min-w-0 max-w-full overflow-x-auto rounded-lg border border-neutral-200 bg-white p-2 pb-32 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:!text-neutral-100">
        <table className="w-full min-w-[1240px] border-collapse">
        <thead>
          <tr>
            {[
              "S.No",
              "Medicine",
              "Strength",
              "Route",
              "Dose",
              "Dose Unit",
              "Frequency",
              "Duration",
              "Duration Unit",
              "Start Time",
              "End Time",
              "Special Instruction",
              "Favourite",
            ].map((label) => (
              <th key={label} className={th}>
                {label === "Favourite" ? (
                  <span className="inline-flex items-center gap-1">
                    <span>Favourite</span>
                    <span className="text-amber-500">⭐</span>
                  </span>
                ) : (
                  label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m, idx) => {
            const editable = !locked && Boolean(onEdit)
            const edit = (
              patch: Partial<VisitMedicine>,
              commit: boolean,
            ) => onEdit?.(idx, patch, commit)
            const frequency = shownFrequency(m)
            return (
            <tr key={idx}>
              <td className={`${td} text-center tabular-nums`}>{idx + 1}</td>
              <td className={td}>
                {editable ? (
                  <MedicineAutocomplete
                    value={m.name}
                    ariaLabel={`Medicine name ${idx + 1}`}
                    className={`${field} min-w-[9.5rem]`}
                    favourite={m.favourite}
                    onToggleFavourite={(fav) => {
                      edit({ favourite: fav }, true)
                      onToggleFavourite?.(idx, fav)
                    }}
                    onChange={(name) => edit({ name }, false)}
                    onSelect={(med) => {
                      edit(
                        {
                          name: med.name,
                          strength: m.strength || med.strength,
                          route: m.route || med.route,
                          dose: m.dose || med.dose,
                          doseUnit: m.doseUnit || med.doseUnit,
                          frequency: m.frequency || med.frequency,
                          duration: m.duration || med.duration,
                          durationUnit: m.durationUnit || med.durationUnit,
                          instruction: m.instruction || med.instruction,
                          favourite: med.favourite !== undefined ? med.favourite : m.favourite,
                        },
                        true,
                      )
                    }}
                    onBlur={() => edit({ name: m.name }, true)}
                  />
                ) : (
                  <span>{m.name}</span>
                )}
                {locked ? null : (
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="ml-2 text-[11px] font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <input
                    value={m.strength || ""}
                    aria-label={`Strength for ${m.name}`}
                    className={field}
                    onChange={(e) => edit({ strength: e.target.value }, false)}
                    onBlur={(e) => edit({ strength: e.target.value }, true)}
                  />
                ) : (
                  m.strength || ""
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <select
                    value={m.route || ""}
                    aria-label={`Route for ${m.name}`}
                    className={field}
                    onChange={(e) => edit({ route: e.target.value }, true)}
                  >
                    <option value="">Select...</option>
                    {optionsWithCurrent(ROUTES, m.route || "").map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  m.route || ""
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <input
                    value={m.dose != null ? m.dose : shownDose(m)}
                    aria-label={`Dose for ${m.name}`}
                    className={`${field} min-w-[3.5rem]`}
                    onChange={(e) => edit({ dose: e.target.value }, false)}
                    onBlur={(e) => edit({ dose: e.target.value }, true)}
                  />
                ) : (
                  shownDose(m)
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <select
                    value={m.doseUnit || ""}
                    aria-label={`Dose unit for ${m.name}`}
                    className={field}
                    onChange={(e) => edit({ doseUnit: e.target.value }, true)}
                  >
                    <option value="">Select...</option>
                    {optionsWithCurrent(DOSE_UNITS, m.doseUnit || "").map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  m.doseUnit || ""
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <select
                    value={frequency}
                    aria-label={`Frequency for ${m.name}`}
                    className={field}
                    onChange={(e) => edit({ frequency: e.target.value }, true)}
                  >
                    <option value="">Select...</option>
                    {optionsWithCurrent(FREQUENCIES, frequency).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  frequency
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <input
                    value={m.duration || ""}
                    aria-label={`Duration for ${m.name}`}
                    className={`${field} min-w-[3.5rem]`}
                    onChange={(e) => edit({ duration: e.target.value }, false)}
                    onBlur={(e) => edit({ duration: e.target.value }, true)}
                  />
                ) : (
                  m.duration || ""
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <select
                    value={m.durationUnit || ""}
                    aria-label={`Duration unit for ${m.name}`}
                    className={field}
                    onChange={(e) => edit({ durationUnit: e.target.value }, true)}
                  >
                    <option value="">Select...</option>
                    {optionsWithCurrent(DURATION_UNITS, m.durationUnit || "").map(
                      (v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ),
                    )}
                  </select>
                ) : (
                  m.durationUnit || ""
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <input
                    type="date"
                    value={m.startDate?.trim() || ""}
                    aria-label={`Start date for ${m.name}`}
                    className={dateField}
                    onChange={(e) => edit({ startDate: e.target.value }, true)}
                  />
                ) : (
                  shownDate(m.startDate)
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <input
                    type="date"
                    value={m.endDate?.trim() || ""}
                    aria-label={`End date for ${m.name}`}
                    className={dateField}
                    onChange={(e) => edit({ endDate: e.target.value }, true)}
                  />
                ) : (
                  shownDate(m.endDate)
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <InstructionCombobox
                    value={m.instruction || ""}
                    ariaLabel={`Special instruction for ${m.name}`}
                    className={`${field} min-w-[11.5rem]`}
                    onChange={(instruction) => edit({ instruction }, false)}
                    onCommit={(instruction) => edit({ instruction }, true)}
                  />
                ) : (
                  m.instruction || ""
                )}
              </td>
              <td className={`${td} text-center`}>
                <button
                  type="button"
                  aria-label={m.favourite ? "Remove favourite" : "Make favourite"}
                  title={
                    m.favourite
                      ? "In favorite list (green star) - click to remove"
                      : "Not in favorite list (orange star) - click to add"
                  }
                  onClick={() => {
                    const nextFav = !m.favourite
                    edit({ favourite: nextFav }, true)
                    onToggleFavourite?.(idx, nextFav)
                  }}
                  className="inline-flex size-7 items-center justify-center rounded hover:bg-neutral-100 transition-transform active:scale-90 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  {m.favourite ? (
                    <span className="text-base text-emerald-500">★</span>
                  ) : (
                    <span className="text-base text-orange-500 hover:text-orange-600">★</span>
                  )}
                </button>
              </td>
            </tr>
            )
          })}
          {locked ? null : (
            <tr>
              <td className={`${td} text-center tabular-nums`}>{rows.length + 1}</td>
              <td className={td}>
                <MedicineAutocomplete
                  value={draft.name}
                  favourite={draft.favourite}
                  onToggleFavourite={(fav) => set("favourite", fav)}
                  onChange={(name) => set("name", name)}
                  onSelect={(med) => {
                    handleMasterSelect(med)
                    if (med.favourite !== undefined) {
                      set("favourite", med.favourite)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      onAdd()
                    }
                  }}
                  placeholder="Type to search med"
                  className={`${field} min-w-[9.5rem]`}
                />
              </td>
              <td className={td}>
                <input
                  value={draft.strength || ""}
                  onChange={(e) => set("strength", e.target.value)}
                  className={field}
                />
              </td>
              <td className={td}>
                <select
                  value={draft.route || ""}
                  onChange={(e) => set("route", e.target.value)}
                  className={field}
                >
                  <option value="">Select...</option>
                  {ROUTES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
              <td className={td}>
                <input
                  value={draft.dose || ""}
                  onChange={(e) => set("dose", e.target.value)}
                  className={`${field} min-w-[3.5rem]`}
                />
              </td>
              <td className={td}>
                <select
                  value={draft.doseUnit || ""}
                  onChange={(e) => set("doseUnit", e.target.value)}
                  className={field}
                >
                  <option value="">Select...</option>
                  {DOSE_UNITS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
              <td className={td}>
                <select
                  value={draft.frequency || ""}
                  onChange={(e) => set("frequency", e.target.value)}
                  className={field}
                >
                  <option value="">Select...</option>
                  {FREQUENCIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
              <td className={td}>
                <input
                  value={draft.duration || ""}
                  onChange={(e) => set("duration", e.target.value)}
                  className={`${field} min-w-[3.5rem]`}
                />
              </td>
              <td className={td}>
                <select
                  value={draft.durationUnit || ""}
                  onChange={(e) => set("durationUnit", e.target.value)}
                  className={field}
                >
                  <option value="">Select...</option>
                  {DURATION_UNITS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
              <td className={td}>
                <input
                  type="date"
                  value={draft.startDate?.trim() || defaultMedicineStartDate()}
                  onChange={(e) => set("startDate", e.target.value)}
                  aria-label="Start date"
                  className={dateField}
                />
              </td>
              <td className={td}>
                <input
                  type="date"
                  value={draft.endDate || ""}
                  onChange={(e) => set("endDate", e.target.value)}
                  aria-label="End date"
                  className={dateField}
                />
              </td>
              <td className={td}>
                <InstructionCombobox
                  value={draft.instruction || ""}
                  ariaLabel="Draft special instruction"
                  placeholder="Select or type..."
                  className={`${field} min-w-[11.5rem]`}
                  onChange={(instruction) => set("instruction", instruction)}
                  onCommit={(instruction) => set("instruction", instruction)}
                />
              </td>
              <td className={`${td} text-center`}>
                <button
                  type="button"
                  aria-label={draft.favourite ? "Remove favourite" : "Make favourite"}
                  title={
                    draft.favourite
                      ? "In favorite list (green star) - click to remove"
                      : "Not in favorite list (orange star) - click to add"
                  }
                  onClick={() => set("favourite", !draft.favourite)}
                  className="inline-flex size-7 items-center justify-center rounded hover:bg-neutral-100 transition-transform active:scale-90 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  {draft.favourite ? (
                    <span className="text-base text-emerald-500">★</span>
                  ) : (
                    <span className="text-base text-orange-500 hover:text-orange-600">★</span>
                  )}
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {locked ? null : (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Add
          </button>
        </div>
      )}
      </div>

      <FavoriteOrderSetModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        practiceId={practiceId}
        currentPrescriptionRows={rows}
        onAddMedicines={(newMeds) => {
          if (onAddMedicines) {
            onAddMedicines(newMeds)
          }
        }}
      />
    </div>
  )
}
