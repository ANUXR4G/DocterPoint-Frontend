"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { proctoService } from "@/lib/services/procto"
import {
  listFavoriteMedicineMaster,
  medicineMatchesQuery,
  medicineSelectionKey,
  normalizeMedicineMasterItem,
  searchMedicineMaster,
  type MedicineMasterItem,
} from "@/lib/medicineMaster"
import {
  defaultMedicineStartDate,
  medicineEndDate,
} from "@/lib/medicineDates"
import { normalizeDurationUnit, type VisitMedicine } from "./MedicineEntryTable"
import { toast } from "sonner"

export type OrderSetItem = {
  name: string
  strength?: string
  route?: string
  dose?: string
  doseUnit?: string
  frequency?: string
  duration?: string
  durationUnit?: string
  instruction?: string
}

export type OrderSet = {
  id: string
  name: string
  description?: string
  category?: string
  medicines: OrderSetItem[]
  isCustom?: boolean
}

const DEFAULT_ORDER_SETS: OrderSet[] = [
  {
    id: "os_dm2_starter",
    name: "Type 2 Diabetes Starter Pack",
    category: "Diabetology",
    description: "Standard initial dual therapy with neuro-protective B-Complex for newly diagnosed or uncontrolled T2DM.",
    medicines: [
      {
        name: "Metformin 500mg",
        strength: "500mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Twice daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take strictly after food with water",
      },
      {
        name: "Glimepiride 1mg",
        strength: "1mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take 30 minutes before breakfast",
      },
      {
        name: "Methylcobalamin (B12) 1500mcg",
        strength: "1500mcg",
        route: "Oral",
        dose: "1",
        doseUnit: "capsule",
        frequency: "Once daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take after lunch or dinner",
      },
    ],
  },
  {
    id: "os_htn_dual",
    name: "Essential Hypertension Dual Therapy",
    category: "Cardiology",
    description: "First-line ARB + CCB combination regimen for stage 1-2 hypertension.",
    medicines: [
      {
        name: "Telmisartan 40mg",
        strength: "40mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take in morning after breakfast",
      },
      {
        name: "Amlodipine 5mg",
        strength: "5mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take in morning with water",
      },
    ],
  },
  {
    id: "os_urti_cough",
    name: "Acute URI & Cough Protocol",
    category: "Respiratory",
    description: "Targeted antimicrobial, antihistamine-bronchodilator, and antipyretic protocol for acute respiratory infection.",
    medicines: [
      {
        name: "Azithromycin 500mg",
        strength: "500mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "3",
        durationUnit: "Days",
        instruction: "Strictly after food, complete full 3-day course",
      },
      {
        name: "Montelukast 10mg + Levocetirizine 5mg",
        strength: "10mg/5mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take at bedtime with water",
      },
      {
        name: "Paracetamol 650mg",
        strength: "650mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Thrice daily",
        duration: "3",
        durationUnit: "Days",
        instruction: "Take after food as needed for body ache or fever",
      },
      {
        name: "Dextromethorphan Cough Syrup",
        strength: "100ml",
        route: "Oral",
        dose: "10",
        doseUnit: "ml",
        frequency: "Thrice daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take after meals with lukewarm water",
      },
    ],
  },
  {
    id: "os_fever_viral",
    name: "Acute Viral Illness & Fever Care",
    category: "General Medicine",
    description: "Antipyretic, electrolyte rehydration, and immune supportive care for viral febrile illnesses.",
    medicines: [
      {
        name: "Paracetamol 650mg",
        strength: "650mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Every 6 hours",
        duration: "3",
        durationUnit: "Days",
        instruction: "Take after meals for fever > 100°F (minimum 6h gap)",
      },
      {
        name: "Oral Rehydration Salts (ORS)",
        strength: "21.8g",
        route: "Oral",
        dose: "1",
        doseUnit: "sachet",
        frequency: "Twice daily",
        duration: "3",
        durationUnit: "Days",
        instruction: "Dissolve entire sachet in 1 liter clean drinking water",
      },
      {
        name: "Vitamin C 500mg + Zinc",
        strength: "500mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "10",
        durationUnit: "Days",
        instruction: "Chew or take with water after breakfast",
      },
    ],
  },
  {
    id: "os_gerd_acid",
    name: "Acute Gastritis & GERD Relief",
    category: "Gastroenterology",
    description: "Rapid mucosal protection and acid suppression bundle for reflux and epigastric burning.",
    medicines: [
      {
        name: "Pantoprazole 40mg",
        strength: "40mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "14",
        durationUnit: "Days",
        instruction: "Take 30 minutes before breakfast on empty stomach",
      },
      {
        name: "Magaldrate + Simethicone Gel",
        strength: "200ml",
        route: "Oral",
        dose: "10",
        doseUnit: "ml",
        frequency: "Thrice daily",
        duration: "7",
        durationUnit: "Days",
        instruction: "Take 1 hour after meals and at bedtime",
      },
      {
        name: "Domperidone 10mg",
        strength: "10mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Twice daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take 15-30 minutes before meals",
      },
    ],
  },
  {
    id: "os_msk_backpain",
    name: "Musculoskeletal Pain & Strain Protocol",
    category: "Orthopedics",
    description: "Short-course analgesia, muscle relaxation, and gastric protection for acute spasm and mechanical strain.",
    medicines: [
      {
        name: "Aceclofenac 100mg + Paracetamol 325mg",
        strength: "100mg/325mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Twice daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Always take strictly after food with water",
      },
      {
        name: "Thiocolchicoside 4mg",
        strength: "4mg",
        route: "Oral",
        dose: "1",
        doseUnit: "capsule",
        frequency: "Twice daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take after morning and evening meals",
      },
      {
        name: "Pantoprazole 40mg",
        strength: "40mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take 30 minutes before breakfast on empty stomach",
      },
    ],
  },
]

type Props = {
  isOpen: boolean
  onClose: () => void
  onAddMedicines: (medicines: VisitMedicine[]) => void
  currentPrescriptionRows?: VisitMedicine[]
  practiceId?: string
}

export default function FavoriteOrderSetModal({
  isOpen,
  onClose,
  onAddMedicines,
  currentPrescriptionRows = [],
  practiceId,
}: Props) {
  const [tab, setTab] = useState<"favorites" | "ordersets">("favorites")
  const [favoriteMeds, setFavoriteMeds] = useState<MedicineMasterItem[]>([])
  const [catalogHits, setCatalogHits] = useState<MedicineMasterItem[]>([])
  const [orderSets, setOrderSets] = useState<OrderSet[]>(DEFAULT_ORDER_SETS)
  const [favSearch, setFavSearch] = useState("")
  const [osSearch, setOsSearch] = useState("")
  const [selectedFavIds, setSelectedFavIds] = useState<Set<string>>(new Set())
  const favByKeyRef = useRef<Map<string, MedicineMasterItem>>(new Map())

  // Create Order Set form state
  const [isCreatingSet, setIsCreatingSet] = useState(false)
  const [newSetName, setNewSetName] = useState("")
  const [newSetCategory, setNewSetCategory] = useState("General")
  const [newSetDescription, setNewSetDescription] = useState("")
  const [newSetMedicines, setNewSetMedicines] = useState<OrderSetItem[]>([])
  const [savingSet, setSavingSet] = useState(false)

  function mergeMedicineList(
    rows: MedicineMasterItem[],
    opts?: { forceFavourite?: boolean },
  ): MedicineMasterItem[] {
    const map = new Map<string, MedicineMasterItem>()
    for (const raw of rows) {
      const m = normalizeMedicineMasterItem(raw)
      if (!m.name?.trim()) continue
      map.set(
        medicineSelectionKey(m),
        opts?.forceFavourite ? { ...m, favourite: true } : m,
      )
    }
    return Array.from(map.values())
  }

  function toVisitRow(med: MedicineMasterItem): VisitMedicine {
    const duration = med.duration || "5"
    const durationUnit = normalizeDurationUnit(med.durationUnit) || "Days"
    const startDate = defaultMedicineStartDate()
    const endDate =
      medicineEndDate(startDate, duration, durationUnit) || undefined
    const dose = med.dose || "1"
    const doseUnit = med.doseUnit || "tablet"
    const frequency = med.frequency || "Once daily"
    return {
      name: med.name,
      medicineId: med.id || undefined,
      medicineCode: med.medicineCode || undefined,
      strength: med.strength || "",
      route: med.route || "Oral",
      dose,
      doseUnit,
      frequency,
      duration,
      durationUnit,
      startDate,
      endDate,
      instruction: med.instruction || "After food",
      amount: [dose, doseUnit].filter(Boolean).join(" "),
      times: frequency ? [frequency] : undefined,
      favourite: true,
    }
  }

  // Fetch favorite medicines when the modal opens
  useEffect(() => {
    if (!isOpen) return
    setFavSearch("")
    setSelectedFavIds(new Set())
    setCatalogHits([])
    const localFavs = listFavoriteMedicineMaster()
    setFavoriteMeds(mergeMedicineList(localFavs, { forceFavourite: true }))

    let cancelled = false
    void proctoService
      .listMedicines({ favourite: true })
      .then((res) => {
        if (cancelled) return
        if (
          res &&
          res.status === "successful" &&
          Array.isArray(res.data) &&
          res.data.length > 0
        ) {
          const remote = (res.data as unknown[]).map((row) =>
            normalizeMedicineMasterItem(row),
          )
          setFavoriteMeds(
            mergeMedicineList([...localFavs, ...remote], {
              forceFavourite: true,
            }),
          )
        }
      })
      .catch(() => {})

    void proctoService
      .listOrderSets({ practiceId })
      .then((res) => {
        if (cancelled) return
        if (res && res.status === "successful" && Array.isArray(res.data)) {
          setOrderSets(res.data)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isOpen, practiceId])

  // When searching, also pull catalog / API hits so non-favorite matches appear
  useEffect(() => {
    if (!isOpen || tab !== "favorites") return
    const q = favSearch.trim()
    if (q.length < 2) {
      setCatalogHits([])
      return
    }
    let cancelled = false
    const localHits = searchMedicineMaster(q, 40)
    setCatalogHits(mergeMedicineList(localHits))
    const t = window.setTimeout(() => {
      void proctoService
        .listMedicines({ q })
        .then((res) => {
          if (cancelled) return
          if (
            res &&
            res.status === "successful" &&
            Array.isArray(res.data) &&
            res.data.length > 0
          ) {
            const remote = (res.data as unknown[]).map((row) =>
              normalizeMedicineMasterItem(row),
            )
            setCatalogHits(mergeMedicineList([...localHits, ...remote]))
          }
        })
        .catch(() => {})
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [isOpen, tab, favSearch])

  const filteredFavs = useMemo(() => {
    return favoriteMeds.filter((m) => medicineMatchesQuery(m, favSearch))
  }, [favoriteMeds, favSearch])

  const filteredCatalog = useMemo(() => {
    const favKeys = new Set(favoriteMeds.map((m) => medicineSelectionKey(m)))
    return catalogHits.filter((m) => {
      if (!medicineMatchesQuery(m, favSearch)) return false
      return !favKeys.has(medicineSelectionKey(m))
    })
  }, [catalogHits, favoriteMeds, favSearch])

  const selectablePool = useMemo(() => {
    const map = new Map<string, MedicineMasterItem>()
    for (const m of [...filteredFavs, ...filteredCatalog]) {
      map.set(medicineSelectionKey(m), m)
    }
    favByKeyRef.current = map
    return map
  }, [filteredFavs, filteredCatalog])

  const filteredOrderSets = useMemo(() => {
    if (!osSearch.trim()) return orderSets
    const q = osSearch.trim().toLowerCase()
    return orderSets.filter(
      (os) =>
        os.name.toLowerCase().includes(q) ||
        (os.description || "").toLowerCase().includes(q) ||
        (os.category || "").toLowerCase().includes(q) ||
        os.medicines.some((m) => m.name.toLowerCase().includes(q)),
    )
  }, [orderSets, osSearch])

  if (!isOpen) return null

  function toggleSelectFav(key: string) {
    if (!key) return
    setSelectedFavIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleAddSingleFav(med: MedicineMasterItem) {
    const isAlreadyAdded = currentPrescriptionRows.some(
      (r) => r.name.trim().toLowerCase() === med.name.trim().toLowerCase(),
    )
    if (isAlreadyAdded) {
      toast.info(`"${med.name}" is already added to the prescription.`)
      return
    }
    onAddMedicines([toVisitRow(med)])
    toast.success(`Added "${med.name}" to prescription`)
  }

  function handleAddSelectedFavs() {
    const keys = [...selectedFavIds]
    if (keys.length === 0) {
      toast.error("Please select at least one medicine to add.")
      return
    }
    // Only the currently selected cards — never the full favorites list.
    const toAdd: MedicineMasterItem[] = []
    for (const key of keys) {
      const med =
        selectablePool.get(key) ||
        favByKeyRef.current.get(key) ||
        favoriteMeds.find((m) => medicineSelectionKey(m) === key)
      if (med) toAdd.push(med)
    }
    if (toAdd.length === 0) {
      toast.error("Could not match the selected medicines. Try again.")
      setSelectedFavIds(new Set())
      return
    }
    const existing = new Set(
      currentPrescriptionRows.map((r) => r.name.trim().toLowerCase()),
    )
    const validMeds = toAdd.filter(
      (m) => !existing.has(m.name.trim().toLowerCase()),
    )
    const already = toAdd.filter((m) =>
      existing.has(m.name.trim().toLowerCase()),
    )

    if (validMeds.length === 0) {
      toast.info(
        already.length === 1
          ? `"${already[0]!.name}" is already added to the prescription.`
          : `${already.length} medicines are already added to the prescription.`,
      )
      return
    }

    onAddMedicines(validMeds.map(toVisitRow))
    toast.success(
      validMeds.length === 1
        ? `Added "${validMeds[0]!.name}" to prescription`
        : `Added ${validMeds.length} medicines to prescription`,
    )
    if (already.length > 0) {
      toast.info(`Skipped ${already.length} already-added medicine(s).`)
    }
    setSelectedFavIds(new Set())
    onClose()
  }

  function handleApplyOrderSet(os: OrderSet) {
    if (!os.medicines || os.medicines.length === 0) return
    const existing = new Set(
      currentPrescriptionRows.map((r) => r.name.trim().toLowerCase()),
    )
    const validMeds = os.medicines.filter(
      (m) => !existing.has(m.name.trim().toLowerCase()),
    )
    const already = os.medicines.filter((m) =>
      existing.has(m.name.trim().toLowerCase()),
    )

    if (validMeds.length === 0) {
      toast.info(
        `All medicines from "${os.name}" are already added to the prescription.`,
      )
      return
    }

    const startDate = defaultMedicineStartDate()
    const rows: VisitMedicine[] = validMeds.map((m) => {
      const duration = m.duration || "5"
      const durationUnit = normalizeDurationUnit(m.durationUnit) || "Days"
      const endDate =
        medicineEndDate(startDate, duration, durationUnit) || undefined
      const dose = m.dose || "1"
      const doseUnit = m.doseUnit || "tablet"
      const frequency = m.frequency || "Once daily"
      return {
        name: m.name,
        strength: m.strength || "",
        route: m.route || "Oral",
        dose,
        doseUnit,
        frequency,
        duration,
        durationUnit,
        startDate,
        endDate,
        instruction: m.instruction || "After food",
        amount: [dose, doseUnit].filter(Boolean).join(" "),
        times: frequency ? [frequency] : undefined,
        favourite: false,
      }
    })
    onAddMedicines(rows)
    if (already.length > 0) {
      toast.info(
        `Skipped ${already.length} already-added medicine(s) from "${os.name}".`,
      )
    }
    onClose()
  }

  function handleImportCurrentPrescription() {
    if (currentPrescriptionRows.length === 0) {
      toast.error("No medicines currently in prescription table to import.")
      return
    }
    const items: OrderSetItem[] = currentPrescriptionRows
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        name: r.name,
        strength: r.strength,
        route: r.route || "Oral",
        dose: r.dose || "1",
        doseUnit: r.doseUnit || "tablet",
        frequency: r.frequency || "Once daily",
        duration: r.duration || "5",
        durationUnit: normalizeDurationUnit(r.durationUnit) || "Days",
        instruction: r.instruction,
      }))
    setNewSetMedicines(items)
    toast.success(`Imported ${items.length} medicines from current prescription into order set!`)
  }

  async function handleSaveOrderSet() {
    const cleanName = newSetName.trim()
    if (!cleanName) {
      toast.error("Order set name is required.")
      return
    }
    if (newSetMedicines.length === 0) {
      toast.error("Please add or import at least one medicine into the order set.")
      return
    }

    setSavingSet(true)
    try {
      const res = await proctoService.createOrderSet({
        name: cleanName,
        category: newSetCategory,
        description: newSetDescription.trim() || undefined,
        medicines: newSetMedicines,
        practiceId,
      })
      if (res.status === "successful" && res.data) {
        const created = res.data as OrderSet
        setOrderSets((prev) => [created, ...prev])
        toast.success(`Order set "${cleanName}" created successfully!`)
        setIsCreatingSet(false)
        setNewSetName("")
        setNewSetDescription("")
        setNewSetMedicines([])
      } else {
        toast.error(res.message || "Could not save order set.")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creating order set.")
    } finally {
      setSavingSet(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/80 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-800/50">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-lg text-amber-600 dark:bg-amber-950/70 dark:text-amber-400">
              ⭐
            </span>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Quick Prescription: Favorites &amp; Order Sets
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Order single favorite medicines or apply complete pre-configured medication groups in 1-click.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab navigation & Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-6 py-3 dark:border-neutral-800">
          <div className="flex gap-2 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => {
                setTab("favorites")
                setIsCreatingSet(false)
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                tab === "favorites"
                  ? "bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              <span>⭐ Favorite Medicines</span>
              <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {favoriteMeds.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("ordersets")
                setIsCreatingSet(false)
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                tab === "ordersets"
                  ? "bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              <span>📦 Order Sets (Groups)</span>
              <span className="rounded-full bg-sky-100 px-1.5 py-0.2 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                {orderSets.length}
              </span>
            </button>
          </div>

          {tab === "ordersets" && !isCreatingSet ? (
            <button
              type="button"
              onClick={() => setIsCreatingSet(true)}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 transition-colors cursor-pointer"
            >
              <span>+ Create Order Set</span>
            </button>
          ) : null}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scroll">
          {/* TAB 1: FAVORITES */}
          {tab === "favorites" && (
            <div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
                <div className="relative w-full sm:w-80">
                  <input
                    type="search"
                    placeholder="Search (e.g. paracetamol 500mg, metformin)…"
                    value={favSearch}
                    onChange={(e) => setFavSearch(e.target.value)}
                    autoFocus
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 pl-8 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  />
                  <span className="absolute left-2.5 top-2 text-neutral-400 text-xs">🔍</span>
                </div>

                {selectedFavIds.size > 0 ? (
                  <button
                    type="button"
                    onClick={handleAddSelectedFavs}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-all cursor-pointer"
                  >
                    <span>✓ Add {selectedFavIds.size} Selected to Prescription</span>
                  </button>
                ) : null}
              </div>

              {filteredFavs.length === 0 && filteredCatalog.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-300 py-12 text-center text-xs text-neutral-400 dark:border-neutral-700">
                  {favSearch.trim()
                    ? <>No medicines found matching &ldquo;{favSearch.trim()}&rdquo;.</>
                    : "No favorite medicines yet. Star medicines in the master list, or search the catalog above."}
                </div>
              ) : (
                <div className="space-y-5">
                  {filteredFavs.length > 0 ? (
                    <div>
                      {favSearch.trim() ? (
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                          Favorites matching search ({filteredFavs.length})
                        </p>
                      ) : null}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredFavs.map((med) => {
                          const key = medicineSelectionKey(med)
                          const isSelected = selectedFavIds.has(key)
                          return (
                            <div
                              key={key}
                              onClick={() => toggleSelectFav(key)}
                              onDoubleClick={() => handleAddSingleFav(med)}
                              title="Click to select for batch addition, or click '+ Add to Rx' (or double-click) to add immediately"
                              className={`flex flex-col justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                                isSelected
                                  ? "border-emerald-500 bg-emerald-50/50 dark:border-emerald-600 dark:bg-emerald-950/30"
                                  : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/70 dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:bg-neutral-800"
                              }`}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelectFav(key)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="size-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="font-bold text-sm text-neutral-900 dark:text-white">
                                      {med.name}
                                    </span>
                                  </div>
                                  <span className="text-emerald-500 text-sm">★</span>
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                                  {med.strength ? (
                                    <span className="rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                                      {med.strength}
                                    </span>
                                  ) : null}
                                  <span>{med.dosageForm || "Tablet"}</span>
                                  <span>•</span>
                                  <span>{med.route || "Oral"}</span>
                                  {med.genericName ? (
                                    <>
                                      <span>•</span>
                                      <span className="italic">{med.genericName}</span>
                                    </>
                                  ) : null}
                                </div>

                                {med.instruction ? (
                                  <p className="mt-1 text-[11px] text-neutral-400 italic">
                                    &ldquo;{med.instruction}&rdquo;
                                  </p>
                                ) : null}
                              </div>

                              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-800/80">
                                <span className="text-[10px] text-neutral-400">
                                  {med.frequency || "Once daily"} · {med.duration || "5"}{" "}
                                  {med.durationUnit || "days"}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleAddSingleFav(med)
                                  }}
                                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs active:scale-95 transition-all cursor-pointer"
                                >
                                  + Add to Rx
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {filteredCatalog.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        Catalog matches ({filteredCatalog.length})
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredCatalog.map((med) => {
                          const key = medicineSelectionKey(med)
                          const isSelected = selectedFavIds.has(key)
                          return (
                            <div
                              key={key}
                              onClick={() => toggleSelectFav(key)}
                              onDoubleClick={() => handleAddSingleFav(med)}
                              className={`flex flex-col justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                                isSelected
                                  ? "border-emerald-500 bg-emerald-50/50 dark:border-emerald-600 dark:bg-emerald-950/30"
                                  : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/70 dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:bg-neutral-800"
                              }`}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelectFav(key)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="size-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="font-bold text-sm text-neutral-900 dark:text-white">
                                      {med.name}
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                                  {med.strength ? <span>{med.strength}</span> : null}
                                  <span>{med.dosageForm || "Tablet"}</span>
                                  {med.genericName ? (
                                    <>
                                      <span>•</span>
                                      <span className="italic">{med.genericName}</span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                              <div className="mt-3 flex justify-end border-t border-neutral-100 pt-2 dark:border-neutral-800/80">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleAddSingleFav(med)
                                  }}
                                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                >
                                  + Add to Rx
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ORDER SETS */}
          {tab === "ordersets" && !isCreatingSet && (
            <div>
              <div className="mb-4">
                <div className="relative w-full sm:w-80">
                  <input
                    type="text"
                    placeholder="Search order sets (e.g. Diabetes, Fever, Gastritis)..."
                    value={osSearch}
                    onChange={(e) => setOsSearch(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 pl-8 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  />
                  <span className="absolute left-2.5 top-2 text-neutral-400 text-xs">🔍</span>
                </div>
              </div>

              {filteredOrderSets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-300 py-12 text-center text-xs text-neutral-400 dark:border-neutral-700">
                  No order sets found matching &ldquo;{osSearch}&rdquo;.
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredOrderSets.map((os) => (
                    <div
                      key={os.id}
                      className="group rounded-xl border border-neutral-200 bg-white p-4 shadow-xs transition-all hover:border-sky-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:border-sky-700"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-100 pb-2.5 dark:border-neutral-700/60">
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleApplyOrderSet(os)}
                              title="Click order set name to apply all medicines to prescription"
                              className="text-left text-base font-bold text-neutral-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors cursor-pointer hover:underline"
                            >
                              {os.name}
                            </button>
                            {os.category ? (
                              <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                {os.category}
                              </span>
                            ) : null}
                            {os.isCustom ? (
                              <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                Custom Set
                              </span>
                            ) : null}
                          </div>
                          {os.description ? (
                            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                              {os.description}
                            </p>
                          ) : null}
                        </div>

                        {/* Instant One-Click Order Button */}
                        <button
                          type="button"
                          onClick={() => handleApplyOrderSet(os)}
                          className="flex items-center gap-1.5 self-start sm:self-center rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sky-700 active:scale-95 transition-all cursor-pointer shrink-0"
                        >
                          <span>⚡</span>
                          <span>Apply Order Set ({os.medicines.length} Meds)</span>
                        </button>
                      </div>

                      {/* Medicines in group preview */}
                      <div className="mt-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
                          Medicines in this group:
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {os.medicines.map((m, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs dark:bg-neutral-900/60"
                            >
                              <div>
                                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                                  {m.name}
                                </span>
                                <span className="ml-1 text-[11px] text-neutral-400">
                                  ({m.dose} {m.doseUnit} · {m.frequency})
                                </span>
                              </div>
                              <span className="text-[10px] text-neutral-400">
                                {m.duration} {m.durationUnit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2 SUBVIEW: CREATE ORDER SET */}
          {tab === "ordersets" && isCreatingSet && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-5 dark:border-sky-900/60 dark:bg-sky-950/20">
              <div className="flex items-center justify-between border-b border-sky-200/80 pb-3 dark:border-sky-900/60">
                <div>
                  <h3 className="text-sm font-bold text-sky-950 dark:text-sky-200">
                    Create New Medication Order Set
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Group common medicines together under a unique name for instant 1-click ordering.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreatingSet(false)}
                  className="text-xs text-neutral-500 hover:text-neutral-800"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-4 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Order Set Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Pediatric Viral Fever Bundle"
                      value={newSetName}
                      onChange={(e) => setNewSetName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Category
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Pediatrics, Surgery, General"
                      value={newSetCategory}
                      onChange={(e) => setNewSetCategory(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Clinical Description / Indications
                  </label>
                  <input
                    type="text"
                    placeholder="Short description of when to apply this medication set"
                    value={newSetDescription}
                    onChange={(e) => setNewSetDescription(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                {/* Import From Current Prescription Row */}
                {currentPrescriptionRows.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-sky-100/70 p-3 dark:bg-sky-900/40">
                    <div className="text-xs text-sky-950 dark:text-sky-200">
                      Current prescription has <strong>{currentPrescriptionRows.length} medicine(s)</strong>.
                    </div>
                    <button
                      type="button"
                      onClick={handleImportCurrentPrescription}
                      className="rounded-md bg-sky-600 px-3 py-1 text-xs font-bold text-white hover:bg-sky-700 transition-colors cursor-pointer"
                    >
                      ⚡ Import from Current Prescription
                    </button>
                  </div>
                )}

                {/* Medicines List in Set */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Medicines in this Set ({newSetMedicines.length})
                    </label>
                  </div>

                  {newSetMedicines.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-neutral-300 py-6 text-center text-xs text-neutral-400 dark:border-neutral-700">
                      No medicines in this set yet. Import from current prescription above or add below.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {newSetMedicines.map((m, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-900 dark:text-white">
                              {m.name}
                            </span>
                            <span className="text-neutral-400">
                              {m.dose} {m.doseUnit} · {m.frequency} · {m.duration} {m.durationUnit}
                            </span>
                            {m.instruction ? (
                              <span className="text-[11px] text-sky-600 dark:text-sky-400 italic">
                                ({m.instruction})
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setNewSetMedicines((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-sky-200 dark:border-sky-900/60">
                  <button
                    type="button"
                    onClick={() => setIsCreatingSet(false)}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingSet}
                    onClick={handleSaveOrderSet}
                    className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {savingSet ? "Saving Set..." : "Save Order Set"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
