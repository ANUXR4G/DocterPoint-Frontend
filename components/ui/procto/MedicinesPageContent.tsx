"use client"

import { useEffect, useState } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import MedicineEntryTable, {
  emptyMedicineDraft,
  editedVisitMedicine,
  type VisitMedicine,
} from "./MedicineEntryTable"
import { CENTRAL_MEDICINE_MASTER } from "@/lib/medicineMaster"
import { defaultMedicineStartDate } from "@/lib/medicineDates"

const STORAGE_KEY = "glucoguide_portal_medicines"

// Sample initial clinic inventory if none stored yet
const INITIAL_MEDICINES: VisitMedicine[] = [
  {
    name: "Metformin 500mg",
    strength: "500 mg",
    route: "Oral",
    dose: "1",
    doseUnit: "tablet",
    frequency: "Twice daily",
    duration: "1",
    durationUnit: "Month",
    startDate: defaultMedicineStartDate(),
    endDate: "",
    instruction: "After meals",
    favourite: true,
  },
  {
    name: "Paracetamol 650mg (Dolo)",
    strength: "650 mg",
    route: "Oral",
    dose: "1",
    doseUnit: "tablet",
    frequency: "Three times daily",
    duration: "3",
    durationUnit: "Day",
    startDate: defaultMedicineStartDate(),
    endDate: "",
    instruction: "After meals as needed for fever",
    favourite: true,
  },
  {
    name: "Pantoprazole 40mg",
    strength: "40 mg",
    route: "Oral",
    dose: "1",
    doseUnit: "tablet",
    frequency: "Once daily",
    duration: "14",
    durationUnit: "Day",
    startDate: defaultMedicineStartDate(),
    endDate: "",
    instruction: "30 minutes before breakfast",
    favourite: false,
  },
]

type Props = {
  portal: "doctor" | "clinic"
}

export default function MedicinesPageContent({ portal }: Props) {
  const [medicines, setMedicines] = useState<VisitMedicine[]>([])
  const [draft, setDraft] = useState<VisitMedicine>(() => emptyMedicineDraft())
  const [filter, setFilter] = useState<"all" | "favourites">("all")
  const [search, setSearch] = useState("")
  const [savedNotice, setSavedNotice] = useState("")
  const [isLoaded, setIsLoaded] = useState(false)

  // Load stored medicines on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as VisitMedicine[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMedicines(parsed)
          setIsLoaded(true)
          return
        }
      }
    } catch {
      // fallback to initial
    }
    setMedicines(INITIAL_MEDICINES)
    setIsLoaded(true)
  }, [])

  // Save to localStorage whenever medicines change
  useEffect(() => {
    if (!isLoaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(medicines))
    } catch {
      // ignore
    }
  }, [medicines, isLoaded])

  function handleAdd() {
    const trimmed = (draft.name || "").trim()
    if (!trimmed) return
    const next = [...medicines, { ...draft, name: trimmed }]
    setMedicines(next)
    setDraft(emptyMedicineDraft())
    notify("Medicine added to clinic list.")
  }

  function handleRemove(index: number) {
    const next = medicines.filter((_, i) => i !== index)
    setMedicines(next)
    notify("Medicine removed.")
  }

  function handleEdit(
    index: number,
    patch: Partial<VisitMedicine>,
    commit: boolean,
  ) {
    const current = medicines[index]
    if (!current) return
    const updated = editedVisitMedicine(current, patch, commit)
    const next = [...medicines]
    next[index] = updated
    setMedicines(next)
  }

  function handleToggleFavourite(index: number, favourite: boolean) {
    const current = medicines[index]
    if (!current) return
    const next = [...medicines]
    next[index] = { ...current, favourite }
    setMedicines(next)
    notify(favourite ? "Added to favourites ⭐" : "Removed from favourites")
  }

  function notify(msg: string) {
    setSavedNotice(msg)
    setTimeout(() => {
      setSavedNotice("")
    }, 3000)
  }

  const displayedRows = medicines.filter((m) => {
    if (filter === "favourites" && !m.favourite) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const match =
        (m.name || "").toLowerCase().includes(q) ||
        (m.instruction || "").toLowerCase().includes(q) ||
        (m.strength || "").toLowerCase().includes(q)
      if (!match) return false
    }
    return true
  })

  const favCount = medicines.filter((m) => m.favourite).length

  return (
    <div className="dashboard-page-wide min-h-0 space-y-4">
      <DashboardPageHeader
        compact
        eyebrow={portal === "doctor" ? "Doctor portal" : "Clinic portal"}
        title="Medicines"
        subtitle="Search centralized Medicine Master database, manage prescriptions, and organize favourite medications."
      />

      {savedNotice ? (
        <div className="rounded-lg bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          {savedNotice}
        </div>
      ) : null}

      {/* Summary Cards - Required Height & Balanced 3-column Layout */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="dashboard-panel !h-auto !min-h-0 !p-3.5 flex flex-col justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Saved Medicines
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              {medicines.length}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              in catalog
            </span>
          </div>
        </div>

        <div className="dashboard-panel !h-auto !min-h-0 !p-3.5 flex flex-col justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Favourites ⭐
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {favCount}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              starred
            </span>
          </div>
        </div>

        <div className="dashboard-panel !h-auto !min-h-0 !p-3.5 flex flex-col justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Centralized Medicine Master
          </p>
          <div className="mt-1.5">
            <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">
              {CENTRAL_MEDICINE_MASTER.length}+ Drugs In Master Database
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-400">
              Type in the table to search & autocomplete options.
            </p>
          </div>
        </div>
      </div>

      {/* Controls & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "all"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            }`}
          >
            All Medicines ({medicines.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("favourites")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "favourites"
                ? "bg-amber-500 text-white"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            }`}
          >
            <span>⭐ Favourites</span>
            <span>({favCount})</span>
          </button>
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter list…"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
        </div>
      </div>

      {/* Medicine Table */}
      <div className="dashboard-panel !p-3">
        <MedicineEntryTable
          rows={displayedRows}
          draft={draft}
          locked={false}
          onDraft={(next) => setDraft(next)}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onEdit={handleEdit}
          onToggleFavourite={handleToggleFavourite}
        />
      </div>
    </div>
  )
}

