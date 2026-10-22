"use client"

import { useEffect, useState, useMemo } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import PopupModal from "@/components/modals/Modal"
import { proctoService } from "@/lib/services/procto"
import {
  CENTRAL_MEDICINE_MASTER,
  ROUTES_LIST,
  DOSAGE_FORMS_LIST,
  type MedicineMasterItem,
} from "@/lib/medicineMaster"
import { downloadMedicineTemplate } from "@/lib/medicineExcel"
import BulkUploadMedicineModal from "./BulkUploadMedicineModal"

export type MedicineItem = {
  id: string
  medicineCode: string
  countryCode: string
  brandName: string
  strength: string
  route: string
  dosageForm: string
  genericName: string
  favourite: boolean
  createdAt?: string
  updatedAt?: string
}

const STORAGE_KEY = "glucoguide_medicine_management_records"

// Convert default master into MedicineItems
function initialMedicinesFromMaster(): MedicineItem[] {
  return CENTRAL_MEDICINE_MASTER.map((m) => ({
    id: m.id,
    medicineCode: m.medicineCode,
    countryCode: m.countryCode,
    brandName: m.brandName || m.name,
    strength: m.strength || "",
    route: m.route || "Oral",
    dosageForm:
      m.dosageForm || (m.doseUnit === "capsule" ? "Capsule" : "Tablet"),
    genericName: m.genericName,
    favourite: Boolean(m.favourite || m.isPopular),
  }))
}

type Props = {
  portal: "doctor" | "clinic"
}

export default function MedicineManagementPage({ portal }: Props) {
  const [medicines, setMedicines] = useState<MedicineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "favourites">("all")
  const [notice, setNotice] = useState("")
  const [errorNotice, setErrorNotice] = useState("")

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formCode, setFormCode] = useState("")
  const [formCountryCode, setFormCountryCode] = useState("")
  const [formBrandName, setFormBrandName] = useState("")
  const [formStrength, setFormStrength] = useState("")
  const [formRoute, setFormRoute] = useState("Oral")
  const [formDosageForm, setFormDosageForm] = useState("Tablet")
  const [formGenericName, setFormGenericName] = useState("")
  const [formFavourite, setFormFavourite] = useState(false)
  const [formError, setFormError] = useState("")

  // Delete Confirmation Modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [medicineToDelete, setMedicineToDelete] = useState<MedicineItem | null>(null)

  // Load medicines from backend API (with localStorage fallback/cache)
  useEffect(() => {
    let active = true

    // Load cached first for 0ms render
    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached) as MedicineItem[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMedicines(parsed)
          setLoading(false)
        }
      }
    } catch {
      // ignore
    }

    // Fetch from backend API
    proctoService
      .listMedicines()
      .then((res: any) => {
        if (!active) return
        if (res && res.status === "successful" && Array.isArray(res.data) && res.data.length > 0) {
          setMedicines(res.data)
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data))
          } catch {
            // ignore
          }
        } else if (medicines.length === 0) {
          const defaults = initialMedicinesFromMaster()
          setMedicines(defaults)
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        if (!active) return
        if (medicines.length === 0) {
          const defaults = initialMedicinesFromMaster()
          setMedicines(defaults)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  // Sync state to localStorage
  function syncStorage(items: MedicineItem[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // ignore
    }
  }

  function showMessage(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(""), 3500)
  }

  function showError(msg: string) {
    setErrorNotice(msg)
    setTimeout(() => setErrorNotice(""), 4000)
  }

  // Open modal for Adding new medicine
  function handleOpenAdd() {
    setEditingId(null)
    setFormCode("")
    setFormCountryCode("")
    setFormBrandName("")
    setFormStrength("")
    setFormRoute("Oral")
    setFormDosageForm("Tablet")
    setFormGenericName("")
    setFormFavourite(false)
    setFormError("")
    setModalOpen(true)
  }

  // Open modal for Editing existing medicine
  function handleOpenEdit(item: MedicineItem) {
    setEditingId(item.id)
    setFormCode(item.medicineCode)
    setFormCountryCode(item.countryCode || "")
    setFormBrandName(item.brandName)
    setFormStrength(item.strength || "")
    setFormRoute(item.route || "Oral")
    setFormDosageForm(item.dosageForm || "Tablet")
    setFormGenericName(item.genericName)
    setFormFavourite(Boolean(item.favourite))
    setFormError("")
    setModalOpen(true)
  }

  // Save Add/Edit Form with Validation
  async function handleSaveForm() {
    const code = formCode.trim()
    const brand = formBrandName.trim()
    const generic = formGenericName.trim()
    const strength = formStrength.trim()
    const country = formCountryCode.trim()

    // Validation
    if (!code) {
      setFormError("Medicine Code is required.")
      return
    }
    if (!brand) {
      setFormError("Brand Name is required.")
      return
    }
    if (!generic) {
      setFormError("Generic Name is required.")
      return
    }

    // Check duplicate Medicine Code (case-insensitive)
    const duplicate = medicines.find(
      (m) =>
        m.medicineCode.trim().toLowerCase() === code.toLowerCase() &&
        m.id !== editingId,
    )
    if (duplicate) {
      setFormError(`Medicine Code "${code}" is already in use by another medicine.`)
      return
    }

    const payload = {
      medicineCode: code,
      countryCode: country,
      brandName: brand,
      strength,
      route: formRoute,
      dosageForm: formDosageForm,
      genericName: generic,
      favourite: formFavourite,
    }

    if (editingId) {
      // Update existing
      const next = medicines.map((m) =>
        m.id === editingId ? { ...m, ...payload, updatedAt: new Date().toISOString() } : m,
      )
      setMedicines(next)
      syncStorage(next)
      setModalOpen(false)
      showMessage(`Medicine "${brand}" updated successfully.`)

      // Call backend
      proctoService.updateMedicine(editingId, payload).catch(() => {})
    } else {
      // Create new
      const newItem: MedicineItem = {
        id: `med-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const next = [newItem, ...medicines]
      setMedicines(next)
      syncStorage(next)
      setModalOpen(false)
      showMessage(`Medicine "${brand}" added successfully.`)

      // Call backend
      proctoService.createMedicine(payload).catch(() => {})
    }
  }

  // Toggle Favourite
  async function handleToggleFavourite(id: string) {
    const item = medicines.find((m) => m.id === id)
    if (!item) return
    const nextFav = !item.favourite

    const next = medicines.map((m) =>
      m.id === id ? { ...m, favourite: nextFav } : m,
    )
    setMedicines(next)
    syncStorage(next)
    showMessage(
      nextFav
        ? `"${item.brandName}" marked as favourite ⭐`
        : `"${item.brandName}" removed from favourites`,
    )

    // Call backend
    proctoService.toggleMedicineFavourite(id, nextFav).catch(() => {})
  }

  // Delete Medicine with confirmation
  function handlePromptDelete(item: MedicineItem) {
    setMedicineToDelete(item)
    setDeleteConfirmOpen(true)
  }

  async function handleConfirmDelete() {
    if (!medicineToDelete) return
    const id = medicineToDelete.id
    const brand = medicineToDelete.brandName

    const next = medicines.filter((m) => m.id !== id)
    setMedicines(next)
    syncStorage(next)
    setDeleteConfirmOpen(false)
    setMedicineToDelete(null)
    showMessage(`Medicine "${brand}" deleted.`)

    // Call backend
    proctoService.deleteMedicine(id).catch(() => {})
  }

  // Filtered rows
  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      if (activeTab === "favourites" && !m.favourite) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matches =
          (m.medicineCode || "").toLowerCase().includes(q) ||
          (m.brandName || "").toLowerCase().includes(q) ||
          (m.genericName || "").toLowerCase().includes(q) ||
          (m.countryCode || "").toLowerCase().includes(q) ||
          (m.strength || "").toLowerCase().includes(q) ||
          (m.route || "").toLowerCase().includes(q) ||
          (m.dosageForm || "").toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [medicines, activeTab, search])

  const totalCount = medicines.length
  const favCount = medicines.filter((m) => m.favourite).length

  const th =
    "sticky top-0 z-10 border border-neutral-200 bg-neutral-100/95 px-3 py-2.5 text-left text-[11px] font-semibold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/95 dark:text-neutral-100 uppercase tracking-wider backdrop-blur-sm"
  const td =
    "border border-neutral-200 px-3 py-2.5 align-middle text-xs text-neutral-900 dark:border-neutral-700 dark:text-neutral-100"

  return (
    <div className="dashboard-page-wide min-h-0 space-y-4">
      {/* 1. Header with Add Medicine button */}
      <DashboardPageHeader
        compact
        eyebrow={portal === "doctor" ? "Doctor Portal" : "Clinic Portal"}
        title="Medicine Management"
        subtitle="Manage master inventory, government codes, commercial brand names, dosage routes, and favourite clinic medications."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Download Template Dropdown Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDownloadMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 active:scale-95 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 cursor-pointer"
                title="Download sample template for bulk medicine upload"
              >
                <span>📥</span>
                <span>Download Template</span>
                <span className="text-[10px] opacity-60">▾</span>
              </button>

              {downloadMenuOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setDownloadMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 animate-in fade-in zoom-in-95">
                    <button
                      type="button"
                      onClick={() => {
                        setDownloadMenuOpen(false)
                        downloadMedicineTemplate("xlsx")
                        showMessage("Excel template (.xlsx) downloaded.")
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
                    >
                      <span className="text-emerald-600">📊</span>
                      <div>
                        <p className="font-semibold">Excel Template (.xlsx)</p>
                        <p className="text-[10px] text-neutral-500">Recommended for Microsoft Excel</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDownloadMenuOpen(false)
                        downloadMedicineTemplate("csv")
                        showMessage("CSV template (.csv) downloaded.")
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
                    >
                      <span className="text-sky-600">📄</span>
                      <div>
                        <p className="font-semibold">CSV Template (.csv)</p>
                        <p className="text-[10px] text-neutral-500">Universal comma-separated text</p>
                      </div>
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            {/* Upload Excel Button */}
            <button
              type="button"
              onClick={() => setBulkUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 active:scale-95 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 cursor-pointer"
              title="Upload Excel or CSV file to bulk import medicines"
            >
              <span>📤</span>
              <span>Upload Excel</span>
            </button>

            {/* Add Medicine Button */}
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--theme-primary,#0284c7)] px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:opacity-95 active:scale-95 cursor-pointer"
            >
              <span>+</span>
              <span>Add Medicine</span>
            </button>
          </div>
        }
      />

      {/* Notifications */}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}
      {errorNotice ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {errorNotice}
        </div>
      ) : null}

      {/* 2. Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter Tabs: All Medicines / Favourite Medicines */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "all"
                ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            }`}
          >
            All Medicines ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("favourites")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "favourites"
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            }`}
          >
            <span>⭐ Favourite Medicines</span>
            <span>({favCount})</span>
          </button>
        </div>

        {/* Search Input: Search by Medicine Code, Brand Name, Generic Name, Govt Code */}
        <div className="w-full sm:w-80">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Code, Brand, Generic, or Govt Code…"
              className="w-full rounded-lg border border-neutral-300 bg-white py-1.5 pl-3 pr-8 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 3. Medicine Table with Increased Height & Smooth Scroll */}
      <div className="chart-x min-w-0 max-w-full flex-1 overflow-x-auto overflow-y-auto min-h-[600px] max-h-[calc(100vh-160px)] rounded-xl border border-neutral-200 bg-white p-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-950">
        <table className="w-full min-w-[1180px] border-collapse text-left">
          <thead>
            <tr>
              <th className={`${th} w-[130px]`}>Medicine Code</th>
              <th className={`${th} w-[160px]`}>Medicine Country Code (Govt Code)</th>
              <th className={`${th} w-[170px]`}>Brand Name</th>
              <th className={`${th} w-[110px]`}>Strength</th>
              <th className={`${th} w-[130px]`}>Route</th>
              <th className={`${th} w-[120px]`}>Dosage Form</th>
              <th className={`${th} min-w-[180px]`}>Generic Name</th>
              <th className={`${th} w-[90px] text-center`}>Favourite</th>
              <th className={`${th} w-[130px] text-center`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-xs text-neutral-500">
                  Loading medicines inventory…
                </td>
              </tr>
            ) : filteredMedicines.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <div className="mx-auto max-w-sm space-y-3">
                    <span className="text-3xl">💊</span>
                    <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                      No medicines available
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {search
                        ? `No results matched "${search}". Try clearing the search or adding a new record.`
                        : activeTab === "favourites"
                        ? "You have not marked any medicines as favourite yet. Click the star icon on any medicine to add it here."
                        : "Your medicine catalog is empty. Click below to add your first medicine record."}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleOpenAdd}
                        className="rounded-lg bg-[var(--theme-primary,#0284c7)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:opacity-95 cursor-pointer"
                      >
                        + Add Medicine
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkUploadOpen(true)}
                        className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 cursor-pointer"
                      >
                        📤 Bulk Upload Excel
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredMedicines.map((m) => (
                <tr
                  key={m.id}
                  className="transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-900/60"
                >
                  {/* 1. Medicine Code */}
                  <td className={td}>
                    <span className="font-mono text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {m.medicineCode}
                    </span>
                  </td>

                  {/* 2. Medicine Country Code (Govt Code) */}
                  <td className={td}>
                    <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300">
                      {m.countryCode || "—"}
                    </span>
                  </td>

                  {/* 3. Brand Name */}
                  <td className={td}>
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {m.brandName}
                    </span>
                  </td>

                  {/* 4. Strength */}
                  <td className={td}>
                    <span className="text-xs text-neutral-700 dark:text-neutral-300">
                      {m.strength || "—"}
                    </span>
                  </td>

                  {/* 5. Route */}
                  <td className={td}>
                    <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 border border-sky-200/60 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60">
                      {m.route || "Oral"}
                    </span>
                  </td>

                  {/* 6. Dosage Form */}
                  <td className={td}>
                    <span className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 border border-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700">
                      {m.dosageForm || "Tablet"}
                    </span>
                  </td>

                  {/* 7. Generic Name */}
                  <td className={td}>
                    <span className="text-xs text-neutral-700 dark:text-neutral-300">
                      {m.genericName || "—"}
                    </span>
                  </td>

                  {/* 8. Favourite */}
                  <td className={`${td} text-center`}>
                    <button
                      type="button"
                      aria-label={m.favourite ? "Remove favourite" : "Make favourite"}
                      title={m.favourite ? "Favourite medicine (Click to unfavourite)" : "Mark as favourite"}
                      onClick={() => handleToggleFavourite(m.id)}
                      className="inline-flex size-7 items-center justify-center rounded hover:bg-neutral-100 transition-transform active:scale-90 dark:hover:bg-neutral-800"
                    >
                      {m.favourite ? (
                        <span className="text-base text-amber-500 font-bold">★</span>
                      ) : (
                        <span className="text-base text-neutral-300 hover:text-amber-400 dark:text-neutral-600">☆</span>
                      )}
                    </button>
                  </td>

                  {/* 9. Actions (Edit and Delete) */}
                  <td className={`${td} text-center`}>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(m)}
                        className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                        title="Edit medicine details in modal"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePromptDelete(m)}
                        className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
                        title="Delete medicine record"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Add / Edit Medicine Modal */}
      <PopupModal
        open={modalOpen}
        handler={() => setModalOpen(false)}
        title={editingId ? "Edit Medicine" : "Add Medicine"}
        direction="center"
        className="!max-w-lg"
      >
        <div className="space-y-4 p-1">
          {formError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Medicine Code */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Medicine Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g. MED-MET-500"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-mono text-xs text-neutral-900 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
              <span className="text-[10px] text-neutral-400">Unique internal SKU</span>
            </div>

            {/* Govt Code */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Country Code (Govt Code)
              </label>
              <input
                type="text"
                value={formCountryCode}
                onChange={(e) => setFormCountryCode(e.target.value)}
                placeholder="e.g. IN-DCGI-88210"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-mono text-xs text-neutral-900 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
              <span className="text-[10px] text-neutral-400">Govt regulatory code</span>
            </div>

            {/* Brand Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Brand Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formBrandName}
                onChange={(e) => setFormBrandName(e.target.value)}
                placeholder="e.g. Glucophage 500 or Dolo 650"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
            </div>

            {/* Generic Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Generic Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formGenericName}
                onChange={(e) => setFormGenericName(e.target.value)}
                placeholder="e.g. Metformin Hydrochloride"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
            </div>

            {/* Strength */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Strength
              </label>
              <input
                type="text"
                value={formStrength}
                onChange={(e) => setFormStrength(e.target.value)}
                placeholder="e.g. 500mg, 100ml"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
            </div>

            {/* Route Dropdown */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Route
              </label>
              <select
                value={formRoute}
                onChange={(e) => setFormRoute(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              >
                {ROUTES_LIST.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Dosage Form Dropdown */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Dosage Form
              </label>
              <select
                value={formDosageForm}
                onChange={(e) => setFormDosageForm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              >
                {DOSAGE_FORMS_LIST.map((df) => (
                  <option key={df} value={df}>
                    {df}
                  </option>
                ))}
              </select>
            </div>

            {/* Favourite Checkbox */}
            <div className="flex items-center gap-2 pt-5">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                <input
                  type="checkbox"
                  checked={formFavourite}
                  onChange={(e) => setFormFavourite(e.target.checked)}
                  className="size-4 rounded text-sky-600 focus:ring-sky-500"
                />
                <span>Mark as Favourite (⭐)</span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-neutral-300 px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveForm}
              className="rounded-lg bg-[var(--theme-primary,#0284c7)] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95"
            >
              {editingId ? "Save Changes" : "Create Medicine"}
            </button>
          </div>
        </div>
      </PopupModal>

      {/* 5. Delete Confirmation Modal */}
      <PopupModal
        open={deleteConfirmOpen}
        handler={() => setDeleteConfirmOpen(false)}
        title="Delete Medicine"
        direction="center"
        className="!max-w-md"
      >
        <div className="space-y-3 p-1">
          <p className="text-xs text-neutral-600 dark:text-neutral-300">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-neutral-900 dark:text-white">
              {medicineToDelete?.brandName}
            </span>{" "}
            (Code: <code className="text-neutral-800 dark:text-neutral-200">{medicineToDelete?.medicineCode}</code>)?
          </p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            This action cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              className="rounded-lg border border-neutral-300 px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
            >
              Delete Medicine
            </button>
          </div>
        </div>
      </PopupModal>

      {/* 3. Bulk Upload Excel/CSV Modal */}
      <BulkUploadMedicineModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        existingMedicines={medicines}
        onSuccess={(updatedList, message) => {
          setMedicines(updatedList)
          syncStorage(updatedList)
          showMessage(message)
        }}
      />
    </div>
  )
}

