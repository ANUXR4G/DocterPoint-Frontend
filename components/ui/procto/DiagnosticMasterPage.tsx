"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { FlaskConical, Lock, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { proctoService } from "@/lib/services/procto"
import { practiceTodayIso, isBeforeClinicToday } from "@/lib/practiceTime"

type Category = {
  code: string
  description: string
  effectiveDate?: string
  isActive?: boolean
  isCustom?: boolean
}

type Subcategory = {
  code: string
  categoryCode: string
  description: string
  isActive?: boolean
}

type Service = {
  id: string
  code: string
  name: string
  categoryCode: string
  subcategoryCode: string
  defaultQty?: number
  instruction?: string
  effectiveDate?: string
  isActive?: boolean
  isCustom?: boolean
  isOrdered?: boolean
}

type TickSection = {
  subcategoryCode: string
  subcategoryName: string
  itemCodes: string[]
}

type TickColumn = {
  categoryCode: string
  categoryName: string
  sections: TickSection[]
}

type TickSheet = {
  id: string
  name: string
  description?: string
  specialty?: string | null
  effectiveDate?: string
  isActive?: boolean
  isCustom?: boolean
  columns: TickColumn[]
}

type SubTab = "categories" | "services" | "ticksheets"

type Props = { portal: "doctor" | "clinic" }

function isLocked(effectiveDate?: string | null) {
  const day = String(effectiveDate || "").slice(0, 10)
  return Boolean(day && isBeforeClinicToday(day))
}

export default function DiagnosticMasterPage({ portal: _portal }: Props) {
  const [practiceId, setPracticeId] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<SubTab>("categories")
  const [loading, setLoading] = useState(true)
  const [canCreate, setCanCreate] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [canDeactivate, setCanDeactivate] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [tickSheets, setTickSheets] = useState<TickSheet[]>([])

  const [catCode, setCatCode] = useState("")
  const [catName, setCatName] = useState("")
  const [editingCat, setEditingCat] = useState<string | null>(null)

  const [svcSearch, setSvcSearch] = useState("")
  const [svcForm, setSvcForm] = useState({
    id: "",
    code: "",
    name: "",
    categoryCode: "LAB",
    subcategoryCode: "BIO",
    instruction: "",
    defaultQty: 1,
  })

  const [sheetId, setSheetId] = useState<string | null>(null)
  const [sheetName, setSheetName] = useState("")
  const [sheetSpecialty, setSheetSpecialty] = useState("")
  const [sheetDesc, setSheetDesc] = useState("")
  const [sheetColumns, setSheetColumns] = useState<TickColumn[]>([])

  const today = practiceTodayIso()

  const load = useCallback(async (pid: string) => {
    setLoading(true)
    const res = await proctoService.listDiagnosticMasters({
      practiceId: pid,
      includeInactive: true,
    })
    setLoading(false)
    if (res.status !== "successful" || !res.data) {
      toast.error(res.message || "Could not load diagnostic masters.")
      return
    }
    const data = res.data as {
      categories?: Category[]
      subcategories?: Subcategory[]
      items?: Service[]
      tickSheets?: TickSheet[]
    }
    setCategories(data.categories || [])
    setSubcategories(data.subcategories || [])
    setServices(data.items || [])
    setTickSheets(data.tickSheets || [])
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const practicesRes = await proctoService.getMyPractices()
      if (!alive || practicesRes.status !== "successful" || !Array.isArray(practicesRes.data))
        return
      const pid = proctoService.resolvePracticeId(practicesRes.data[0])
      if (!pid) {
        setLoading(false)
        return
      }
      setPracticeId(pid)
      const permRes = await proctoService.getMyPracticePermissions(pid)
      if (alive && permRes.status === "successful" && permRes.data?.permissions) {
        const p = permRes.data.permissions
        setCanCreate(Boolean(p.CREATE_MASTER_DATA))
        setCanEdit(Boolean(p.EDIT_MASTER_DATA))
        setCanDeactivate(Boolean(p.DEACTIVATE_MASTER_DATA))
      }
      await load(pid)
    })()
    return () => {
      alive = false
    }
  }, [load])

  const filteredServices = useMemo(() => {
    const q = svcSearch.trim().toLowerCase()
    if (!q) return services
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.categoryCode.toLowerCase().includes(q),
    )
  }, [services, svcSearch])

  const subsForCategory = useMemo(
    () =>
      subcategories.filter(
        (s) => s.categoryCode === svcForm.categoryCode && s.isActive !== false,
      ),
    [subcategories, svcForm.categoryCode],
  )

  async function saveCategory() {
    if (!practiceId) return
    const code = editingCat || catCode
    if (!code.trim() || !catName.trim()) {
      toast.error("Category code and name are required.")
      return
    }
    const isNew = !editingCat
    if (isNew && !canCreate) {
      toast.error("Your clinic role can't create master data.")
      return
    }
    if (!isNew && !canEdit) {
      toast.error("Your clinic role can't edit master data.")
      return
    }
    const res = isNew
      ? await proctoService.createDiagnosticCategory({
          practiceId,
          code,
          description: catName,
          effectiveDate: today,
        })
      : await proctoService.updateDiagnosticCategory(code, {
          practiceId,
          description: catName,
          effectiveDate: today,
        })
    if (res.status !== "successful") {
      toast.error(res.message || "Could not save category.")
      return
    }
    toast.success(isNew ? "Category created." : "Category updated.")
    setCatCode("")
    setCatName("")
    setEditingCat(null)
    await load(practiceId)
  }

  async function deactivateCategory(code: string) {
    if (!practiceId || !canDeactivate) return
    const res = await proctoService.deactivateDiagnosticCategory(code, practiceId)
    if (res.status !== "successful") {
      toast.error(res.message || "Could not deactivate category.")
      return
    }
    toast.success("Category deactivated.")
    await load(practiceId)
  }

  function startEditCategory(c: Category) {
    if (isLocked(c.effectiveDate)) {
      toast.error("Historical categories prior to today are locked.")
      return
    }
    setEditingCat(c.code)
    setCatCode(c.code)
    setCatName(c.description)
  }

  function startEditService(s: Service) {
    if (isLocked(s.effectiveDate)) {
      toast.error("Historical services prior to today are locked.")
      return
    }
    setSvcForm({
      id: s.id,
      code: s.code,
      name: s.name,
      categoryCode: s.categoryCode,
      subcategoryCode: s.subcategoryCode,
      instruction: s.instruction || "",
      defaultQty: s.defaultQty ?? 1,
    })
  }

  async function saveService() {
    if (!practiceId) return
    const isNew = !svcForm.id
    if (isNew && !canCreate) {
      toast.error("Your clinic role can't create master data.")
      return
    }
    if (!isNew && !canEdit) {
      toast.error("Your clinic role can't edit master data.")
      return
    }
    const body = {
      practiceId,
      id: svcForm.id || undefined,
      code: svcForm.code,
      name: svcForm.name,
      categoryCode: svcForm.categoryCode,
      subcategoryCode: svcForm.subcategoryCode,
      instruction: svcForm.instruction,
      defaultQty: svcForm.defaultQty,
      effectiveDate: today,
      isActive: true,
    }
    const res = isNew
      ? await proctoService.createDiagnosticService(body)
      : await proctoService.updateDiagnosticService(svcForm.id, body)
    if (res.status !== "successful") {
      toast.error(res.message || "Could not save service.")
      return
    }
    toast.success(isNew ? "Service created." : "Service updated.")
    setSvcForm({
      id: "",
      code: "",
      name: "",
      categoryCode: "LAB",
      subcategoryCode: "BIO",
      instruction: "",
      defaultQty: 1,
    })
    await load(practiceId)
  }

  async function deactivateService(s: Service) {
    if (!practiceId || !canDeactivate) return
    if (isLocked(s.effectiveDate)) {
      toast.error("Historical services prior to today are locked.")
      return
    }
    const res = await proctoService.deactivateDiagnosticService(s.id, practiceId)
    if (res.status !== "successful") {
      toast.error(res.message || "Could not deactivate service.")
      return
    }
    toast.success(s.isOrdered ? "Service deactivated (ordered history preserved)." : "Service removed.")
    await load(practiceId)
  }

  function openSheet(sheet: TickSheet) {
    setSheetId(sheet.id)
    setSheetName(sheet.name)
    setSheetSpecialty(sheet.specialty || "")
    setSheetDesc(sheet.description || "")
    setSheetColumns(
      sheet.columns.map((c) => ({
        ...c,
        sections: c.sections.map((s) => ({ ...s, itemCodes: [...s.itemCodes] })),
      })),
    )
  }

  function newSheetFromCategories() {
    setSheetId(null)
    setSheetName("")
    setSheetSpecialty("")
    setSheetDesc("")
    setSheetColumns(
      categories
        .filter((c) => c.isActive !== false)
        .map((c) => ({
          categoryCode: c.code,
          categoryName: c.description,
          sections: subcategories
            .filter((s) => s.categoryCode === c.code && s.isActive !== false)
            .map((s) => ({
              subcategoryCode: s.code,
              subcategoryName: s.description,
              itemCodes: services
                .filter(
                  (svc) =>
                    svc.categoryCode === c.code &&
                    svc.subcategoryCode === s.code &&
                    svc.isActive !== false,
                )
                .map((svc) => svc.code),
            })),
        })),
    )
  }

  function toggleItemOnSheet(
    colIdx: number,
    secIdx: number,
    code: string,
  ) {
    setSheetColumns((prev) =>
      prev.map((col, ci) => {
        if (ci !== colIdx) return col
        return {
          ...col,
          sections: col.sections.map((sec, si) => {
            if (si !== secIdx) return sec
            const has = sec.itemCodes.includes(code)
            return {
              ...sec,
              itemCodes: has
                ? sec.itemCodes.filter((c) => c !== code)
                : [...sec.itemCodes, code],
            }
          }),
        }
      }),
    )
  }

  async function saveTickSheet() {
    if (!practiceId) return
    if (!sheetName.trim()) {
      toast.error("Tick sheet name is required.")
      return
    }
    const isNew = !sheetId
    if (isNew && !canCreate) {
      toast.error("Your clinic role can't create master data.")
      return
    }
    if (!isNew && !canEdit) {
      toast.error("Your clinic role can't edit master data.")
      return
    }
    const existing = tickSheets.find((t) => t.id === sheetId)
    if (existing && isLocked(existing.effectiveDate)) {
      toast.error("Historical tick sheets prior to today are locked.")
      return
    }
    const body = {
      practiceId,
      id: sheetId || undefined,
      name: sheetName,
      description: sheetDesc,
      specialty: sheetSpecialty.trim() || null,
      effectiveDate: today,
      columns: sheetColumns,
      isActive: true,
    }
    const res = isNew
      ? await proctoService.createDiagnosticTickSheet(body)
      : await proctoService.updateDiagnosticTickSheet(sheetId!, body)
    if (res.status !== "successful") {
      toast.error(res.message || "Could not save tick sheet.")
      return
    }
    toast.success(isNew ? "Tick sheet created." : "Tick sheet updated.")
    const saved = res.data as TickSheet
    setSheetId(saved.id)
    await load(practiceId)
  }

  async function deactivateTickSheet(id: string) {
    if (!practiceId || !canDeactivate) return
    const existing = tickSheets.find((t) => t.id === id)
    if (existing && isLocked(existing.effectiveDate)) {
      toast.error("Historical tick sheets prior to today are locked.")
      return
    }
    const res = await proctoService.deactivateDiagnosticTickSheet(id, practiceId)
    if (res.status !== "successful") {
      toast.error(res.message || "Could not deactivate tick sheet.")
      return
    }
    toast.success("Tick sheet deactivated.")
    if (sheetId === id) {
      setSheetId(null)
      setSheetColumns([])
    }
    await load(practiceId)
  }

  const subTabs: Array<{ id: SubTab; label: string }> = [
    { id: "categories", label: "Category Master" },
    { id: "services", label: "Service Master" },
    { id: "ticksheets", label: "Tick Sheet Configuration" },
  ]

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="dashboard-section-title flex items-center gap-2 text-lg">
            <FlaskConical className="size-5 text-teal-600" />
            Diagnostic Order Master
          </h2>
          <p className="dashboard-section-sub mt-1 max-w-3xl">
            Category Master (Laboratory, Radiology, Clinical Procedure, Surgery), Service
            Master (e.g. FBS, US Abdomen, Casting), and specialty tick sheets. Historical
            rows prior to today are locked — same effective-date rule as Medicine Master.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              subTab === t.id
                ? "bg-teal-600 text-white"
                : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-sm text-neutral-500">Loading diagnostic masters…</p>
      ) : null}

      {!loading && subTab === "categories" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-sm font-bold">
              {editingCat ? `Edit ${editingCat}` : "Add category"}
            </h3>
            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                placeholder="Code (e.g. LAB)"
                value={catCode}
                disabled={Boolean(editingCat)}
                onChange={(e) => setCatCode(e.target.value.toUpperCase())}
              />
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                placeholder="Name (e.g. Laboratory)"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveCategory()}
                  disabled={!(editingCat ? canEdit : canCreate)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Save className="size-3.5" /> Save
                </button>
                {editingCat ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCat(null)
                      setCatCode("")
                      setCatName("")
                    }}
                    className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold dark:border-neutral-600"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-sm font-bold">Categories</h3>
            <ul className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
              {categories.map((c) => {
                const locked = isLocked(c.effectiveDate)
                return (
                  <li
                    key={c.code}
                    className="flex items-center justify-between gap-2 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-semibold">
                        {c.description}{" "}
                        <span className="font-mono text-xs opacity-60">{c.code}</span>
                      </p>
                      <p className="text-xs opacity-60">
                        {c.isActive === false ? "Inactive · " : ""}
                        {c.effectiveDate ? `Effective ${c.effectiveDate}` : "Platform seed"}
                        {locked ? " · locked" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {locked ? <Lock className="size-3.5 text-amber-600" /> : null}
                      <button
                        type="button"
                        disabled={locked || !canEdit}
                        onClick={() => startEditCategory(c)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-40 dark:text-teal-300"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={locked || !canDeactivate || c.isActive === false}
                        onClick={() => void deactivateCategory(c.code)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        Deactivate
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {!loading && subTab === "services" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-sm font-bold">
              {svcForm.id ? "Edit service" : "Add service"}
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <input
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                placeholder="Code (FBS)"
                value={svcForm.code}
                onChange={(e) =>
                  setSvcForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
              />
              <input
                className="sm:col-span-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                placeholder="Name (Fasting Blood Sugar)"
                value={svcForm.name}
                onChange={(e) => setSvcForm((f) => ({ ...f, name: e.target.value }))}
              />
              <select
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                value={svcForm.categoryCode}
                onChange={(e) =>
                  setSvcForm((f) => ({
                    ...f,
                    categoryCode: e.target.value,
                    subcategoryCode:
                      subcategories.find((s) => s.categoryCode === e.target.value)
                        ?.code || "",
                  }))
                }
              >
                {categories
                  .filter((c) => c.isActive !== false)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.description}
                    </option>
                  ))}
              </select>
              <select
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                value={svcForm.subcategoryCode}
                onChange={(e) =>
                  setSvcForm((f) => ({ ...f, subcategoryCode: e.target.value }))
                }
              >
                {subsForCategory.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.description}
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                placeholder="Instruction"
                value={svcForm.instruction}
                onChange={(e) =>
                  setSvcForm((f) => ({ ...f, instruction: e.target.value }))
                }
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void saveService()}
                disabled={!(svcForm.id ? canEdit : canCreate)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save className="size-3.5" /> Save service
              </button>
              {svcForm.id ? (
                <button
                  type="button"
                  onClick={() =>
                    setSvcForm({
                      id: "",
                      code: "",
                      name: "",
                      categoryCode: "LAB",
                      subcategoryCode: "BIO",
                      instruction: "",
                      defaultQty: 1,
                    })
                  }
                  className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold dark:border-neutral-600"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Services</h3>
              <input
                className="w-full max-w-xs rounded-xl border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                placeholder="Search code or name…"
                value={svcSearch}
                onChange={(e) => setSvcSearch(e.target.value)}
              />
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase opacity-60">
                  <tr>
                    <th className="px-2 py-2">Code</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.map((s) => {
                    const locked = isLocked(s.effectiveDate)
                    const cat =
                      categories.find((c) => c.code === s.categoryCode)?.description ||
                      s.categoryCode
                    return (
                      <tr
                        key={s.id}
                        className="border-t border-neutral-100 dark:border-neutral-800"
                      >
                        <td className="px-2 py-2 font-mono text-xs">{s.code}</td>
                        <td className="px-2 py-2">{s.name}</td>
                        <td className="px-2 py-2 text-xs opacity-70">{cat}</td>
                        <td className="px-2 py-2 text-xs">
                          {s.isActive === false ? "Inactive" : "Active"}
                          {s.isOrdered ? " · ordered" : ""}
                          {locked ? " · locked" : ""}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            disabled={locked || !canEdit}
                            onClick={() => startEditService(s)}
                            className="mr-1 rounded-lg px-2 py-1 text-xs font-semibold text-teal-700 disabled:opacity-40"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={locked || !canDeactivate || s.isActive === false}
                            onClick={() => void deactivateService(s)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-40"
                          >
                            {s.isOrdered ? "Deactivate" : "Delete"}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && subTab === "ticksheets" ? (
        <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Tick sheets</h3>
              <button
                type="button"
                disabled={!canCreate}
                onClick={newSheetFromCategories}
                className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Plus className="size-3" /> New
              </button>
            </div>
            <ul className="mt-3 space-y-1">
              {tickSheets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openSheet(t)}
                    className={`flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm ${
                      sheetId === t.id
                        ? "bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
                        : "hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-xs opacity-60">
                      {t.specialty || "Clinic-wide"}
                      {t.isActive === false ? " · inactive" : ""}
                      {isLocked(t.effectiveDate) ? " · locked" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            {sheetColumns.length === 0 && !sheetName ? (
              <p className="py-12 text-center text-sm text-neutral-500">
                Select a tick sheet or create one for a specialty. Clinics configure which
                ordered tests appear on the visit tick sheet.
              </p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                    placeholder="Sheet name"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                  />
                  <input
                    className="rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                    placeholder="Specialty (optional — e.g. Orthopedics)"
                    value={sheetSpecialty}
                    onChange={(e) => setSheetSpecialty(e.target.value)}
                  />
                  <input
                    className="sm:col-span-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                    placeholder="Description"
                    value={sheetDesc}
                    onChange={(e) => setSheetDesc(e.target.value)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveTickSheet()}
                    disabled={!(sheetId ? canEdit : canCreate)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Save className="size-3.5" /> Save tick sheet
                  </button>
                  {sheetId ? (
                    <button
                      type="button"
                      disabled={!canDeactivate}
                      onClick={() => void deactivateTickSheet(sheetId)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" /> Deactivate
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {sheetColumns.map((col, colIdx) => (
                    <div
                      key={`${col.categoryCode}-${colIdx}`}
                      className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700"
                    >
                      <h4 className="text-xs font-bold uppercase tracking-wide text-teal-800 dark:text-teal-200">
                        {col.categoryName}
                      </h4>
                      {col.sections.map((sec, secIdx) => {
                        const available = services.filter(
                          (s) =>
                            s.categoryCode === col.categoryCode &&
                            s.subcategoryCode === sec.subcategoryCode &&
                            s.isActive !== false,
                        )
                        return (
                          <div key={sec.subcategoryCode} className="mt-2">
                            <p className="text-[11px] font-semibold opacity-70">
                              {sec.subcategoryName}
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {available.map((s) => {
                                const on = sec.itemCodes.includes(s.code)
                                return (
                                  <li key={s.id}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleItemOnSheet(colIdx, secIdx, s.code)
                                      }
                                      className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs ${
                                        on
                                          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                                          : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300"
                                      }`}
                                    >
                                      <span
                                        className={`flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                                          on
                                            ? "bg-emerald-500 text-white"
                                            : "border border-neutral-300 text-neutral-400"
                                        }`}
                                      >
                                        {on ? "✓" : ""}
                                      </span>
                                      <span className="truncate">{s.name}</span>
                                    </button>
                                  </li>
                                )
                              })}
                              {!available.length ? (
                                <li className="text-[11px] opacity-50">No services</li>
                              ) : null}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
