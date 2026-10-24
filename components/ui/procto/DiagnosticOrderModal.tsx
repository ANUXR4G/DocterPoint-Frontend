"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import {
  catalogToVisitLine,
  type DiagnosticCatalogItem,
  type VisitDiagnostic,
} from "@/lib/diagnosticMaster"
import { dashboardPortalRoot } from "@/lib/portalRoot"
import { proctoService } from "@/lib/services/procto"
import { formatPracticeDate } from "@/lib/practiceTime"

type Tab = "favorites" | "sets" | "previous" | "tick"

type OrderSet = {
  id: string
  name: string
  description?: string
  category?: string
  items: Array<{
    code?: string
    name: string
    qty?: number
    instruction?: string
    type?: string
    categoryCode?: string
  }>
  isCustom?: boolean
}

type PreviousVisit = {
  bookingId: string
  when: string | null
  status: string
  items: VisitDiagnostic[]
}

type TickItem = DiagnosticCatalogItem & { type?: string }

type TickSheet = {
  id: string
  name: string
  description?: string
  columns: Array<{
    categoryCode: string
    categoryName: string
    sections: Array<{
      subcategoryCode: string
      subcategoryName: string
      items: TickItem[]
    }>
  }>
}

type Props = {
  practiceId?: string | null
  patientId?: string | null
  patientPhone?: string | null
  bookingId?: string | null
  current: VisitDiagnostic[]
  onClose: () => void
  onAdd: (lines: VisitDiagnostic[]) => void
}

export default function DiagnosticOrderModal({
  practiceId,
  patientId,
  patientPhone,
  bookingId,
  current,
  onClose,
  onAdd,
}: Props) {
  const [tab, setTab] = useState<Tab>("tick")
  const [favorites, setFavorites] = useState<DiagnosticCatalogItem[]>([])
  const [sets, setSets] = useState<OrderSet[]>([])
  const [previous, setPrevious] = useState<PreviousVisit[]>([])
  const [tick, setTick] = useState<TickSheet | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingSet, setSavingSet] = useState(false)
  const [setName, setSetName] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const currentKeys = useMemo(
    () => new Set(current.map((d) => d.name.trim().toLowerCase())),
    [current],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const pid = practiceId || undefined
      const [favRes, setRes, prevRes, tickRes] = await Promise.all([
        pid
          ? proctoService.listDiagnostics({ practiceId: pid, favourite: true })
          : Promise.resolve({ status: "unsuccessful" as const, data: null }),
        proctoService.listDiagnosticOrderSets(pid),
        pid
          ? proctoService.listPreviousDiagnostics({
              practiceId: pid,
              patientId: patientId || undefined,
              patientPhone: patientPhone || undefined,
              excludeBookingId: bookingId || undefined,
            })
          : Promise.resolve({ status: "unsuccessful" as const, data: null }),
        proctoService.getDiagnosticTickSheet("tick_standard", pid),
      ])
      if (cancelled) return
      if (favRes.status === "successful" && Array.isArray(favRes.data)) {
        setFavorites(favRes.data as DiagnosticCatalogItem[])
      }
      if (setRes.status === "successful" && Array.isArray(setRes.data)) {
        setSets(setRes.data as OrderSet[])
      }
      if (prevRes.status === "successful" && Array.isArray(prevRes.data)) {
        setPrevious(prevRes.data as PreviousVisit[])
      }
      if (tickRes.status === "successful" && tickRes.data) {
        setTick(tickRes.data as TickSheet)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [practiceId, patientId, patientPhone, bookingId])

  function toggleCode(code: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function applyTick() {
    if (!tick) return
    const byCode = new Map<string, TickItem>()
    for (const col of tick.columns) {
      for (const sec of col.sections) {
        for (const item of sec.items) {
          byCode.set(item.code, item)
        }
      }
    }
    const lines = [...picked]
      .map((code) => byCode.get(code))
      .filter(Boolean)
      .map((item) => catalogToVisitLine(item!))
    onAdd(lines)
    onClose()
  }

  function applyFavorites(selected: DiagnosticCatalogItem[]) {
    onAdd(selected.map(catalogToVisitLine))
    onClose()
  }

  function applySet(set: OrderSet) {
    onAdd(
      set.items.map((i) => ({
        name: i.name,
        code: i.code,
        type: i.type || set.category || "Laboratory",
        categoryCode: i.categoryCode,
        qty: i.qty ?? 1,
        instruction: i.instruction || "",
      })),
    )
    onClose()
  }

  function applyPrevious(visit: PreviousVisit) {
    onAdd(
      visit.items.map((i) => ({
        ...i,
        isOrdered: false,
        isHistorical: false,
        status: undefined,
        orderedAt: undefined,
      })),
    )
    onClose()
  }

  async function saveCurrentAsSet() {
    if (!practiceId || !current.length) {
      toast.error("Add tests to the grid first, then save as an order set.")
      return
    }
    const name = setName.trim() || `Diagnostic set ${new Date().toLocaleDateString()}`
    setSavingSet(true)
    const res = await proctoService.createDiagnosticOrderSet({
      practiceId,
      name,
      items: current.map((d) => ({
        name: d.name,
        code: d.code,
        qty: d.qty ?? 1,
        instruction: d.instruction,
        type: d.type,
        categoryCode: d.categoryCode,
      })),
    })
    setSavingSet(false)
    if (res.status !== "successful") {
      toast.error(res.message || "Could not save order set.")
      return
    }
    toast.success("Diagnostic order set saved.")
    setSetName("")
    const list = await proctoService.listDiagnosticOrderSets(practiceId)
    if (list.status === "successful" && Array.isArray(list.data)) {
      setSets(list.data as OrderSet[])
    }
  }

  async function toggleFavourite(item: DiagnosticCatalogItem) {
    if (!practiceId) return
    const res = await proctoService.toggleDiagnosticFavourite(item.id, practiceId)
    if (res.status !== "successful") {
      toast.error(res.message || "Could not update favourite.")
      return
    }
    const fav = Boolean((res.data as { favourite?: boolean })?.favourite)
    setFavorites((prev) => {
      if (fav) {
        const exists = prev.some((p) => p.id === item.id)
        return exists
          ? prev.map((p) => (p.id === item.id ? { ...p, favourite: true } : p))
          : [...prev, { ...item, favourite: true }]
      }
      return prev.filter((p) => p.id !== item.id)
    })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "tick", label: "Tick sheet" },
    { id: "favorites", label: "Favorites" },
    { id: "sets", label: "Order sets" },
    { id: "previous", label: "Previous orders" },
  ]

  if (!mounted) return null

  // Portal above the fixed sidebar (z-50) — same pattern as PopupModal.
  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Diagnostic orders"
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-neutral-950 ${
          tab === "tick" ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              Diagnostic orders
            </h3>
            <p className="text-xs text-neutral-500">
              Tick tests or refill from favorites, sets, and prior visits.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 cursor-pointer"
          >
            Close
          </button>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200 px-3 dark:border-neutral-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-3 py-2.5 text-sm font-semibold cursor-pointer ${
                tab === t.id
                  ? "border-b-2 border-[var(--theme-primary)] text-[var(--theme-primary)]"
                  : "text-neutral-500"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : tab === "tick" && tick ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900 dark:text-white">
                    {tick.name}
                  </p>
                  {tick.description ? (
                    <p className="text-xs text-neutral-500">{tick.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={applyTick}
                  disabled={!picked.size}
                  className="shrink-0 rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-semibold text-[var(--theme-primary-foreground)] disabled:opacity-40 cursor-pointer"
                >
                  Add {picked.size || ""} selected
                </button>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 rounded-xl border border-neutral-200 dark:border-neutral-700 sm:grid-cols-2 xl:grid-cols-4">
                {tick.columns.map((col, colIdx) => (
                  <section
                    key={col.categoryCode}
                    className={`flex min-w-0 min-h-0 flex-col border-neutral-200 dark:border-neutral-700 ${
                      colIdx > 0 ? "border-t sm:border-t-0" : ""
                    } ${colIdx % 2 === 1 ? "sm:border-l" : ""} ${
                      colIdx >= 2 ? "sm:border-t xl:border-t-0 xl:border-l" : ""
                    }`}
                  >
                    <h4 className="shrink-0 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-sm font-bold tracking-wide text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white">
                      {col.categoryName}
                    </h4>
                    <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 py-3">
                      {col.sections.map((sec) => (
                        <div key={sec.subcategoryCode} className="min-w-0">
                          <p className="mb-1.5 border-b border-dashed border-neutral-200 pb-1 text-[11px] font-bold uppercase tracking-wide text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                            {sec.subcategoryName}
                          </p>
                          <ul className="space-y-0.5">
                            {sec.items.map((item) => {
                              const already = currentKeys.has(
                                item.name.trim().toLowerCase(),
                              )
                              const checked = picked.has(item.code)
                              return (
                                <li key={item.code} className="min-w-0">
                                  <label
                                    className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-md py-1 text-sm ${
                                      already
                                        ? "opacity-40"
                                        : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--theme-primary)]"
                                      disabled={already}
                                      checked={checked || already}
                                      onChange={() => toggleCode(item.code)}
                                    />
                                    <span className="min-w-0 flex-1 leading-snug">
                                      <span className="block break-words font-medium text-neutral-900 dark:text-neutral-100">
                                        {item.name}
                                      </span>
                                      {item.instruction ? (
                                        <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
                                          {item.instruction}
                                        </span>
                                      ) : null}
                                    </span>
                                  </label>
                                </li>
                              )
                            })}
                            {!sec.items.length ? (
                              <li className="py-1 text-xs text-neutral-400">
                                —
                              </li>
                            ) : null}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          ) : tab === "favorites" ? (
            <div className="space-y-2">
              {favorites.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Star tests from the catalog or tick sheet favourites to pin them
                  here.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => applyFavorites(favorites)}
                    className="rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-primary-foreground)] cursor-pointer"
                  >
                    Add all favorites
                  </button>
                  <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {favorites.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-2 py-2"
                      >
                        <div>
                          <p className="font-medium">{f.name}</p>
                          <p className="text-xs text-neutral-500">
                            {f.type || f.categoryCode}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void toggleFavourite(f)}
                            className="text-xs text-amber-600 cursor-pointer"
                          >
                            Unstar
                          </button>
                          <button
                            type="button"
                            onClick={() => applyFavorites([f])}
                            className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900 cursor-pointer"
                          >
                            Add
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : tab === "sets" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-600">
                <p className="mb-2 text-sm font-semibold">Save current grid as order set</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="min-w-[180px] flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
                    placeholder="Set name"
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={savingSet || !current.length}
                    onClick={() => void saveCurrentAsSet()}
                    className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900 cursor-pointer"
                  >
                    {savingSet ? "Saving…" : "Save set"}
                  </button>
                </div>
              </div>
              {sets.length === 0 ? (
                <p className="text-sm text-neutral-500">No order sets yet.</p>
              ) : (
                <ul className="space-y-2">
                  {sets.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{s.name}</p>
                          <p className="text-xs text-neutral-500">
                            {s.category || "Diagnostics"} · {s.items.length} tests
                            {s.description ? ` · ${s.description}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => applySet(s)}
                          className="rounded-md bg-[var(--theme-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-primary-foreground)] cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {previous.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No previous diagnostic orders for this patient.
                </p>
              ) : (
                previous.map((v) => (
                  <div
                    key={v.bookingId}
                    className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {v.when
                          ? formatPracticeDate(v.when)
                          : "Prior visit"}{" "}
                        <span className="font-normal text-neutral-500">
                          · {v.status}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => applyPrevious(v)}
                        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900 cursor-pointer"
                      >
                        Refill
                      </button>
                    </div>
                    <ul className="text-xs text-neutral-600 dark:text-neutral-300">
                      {v.items.map((i, idx) => (
                        <li key={`${i.name}-${idx}`}>
                          {i.type ? `${i.type}: ` : ""}
                          {i.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    dashboardPortalRoot(),
  )
}
