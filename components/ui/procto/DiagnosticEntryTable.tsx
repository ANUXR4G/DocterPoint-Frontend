"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  catalogToVisitLine,
  emptyDiagnosticDraft,
  type DiagnosticCatalogItem,
  type VisitDiagnostic,
} from "@/lib/diagnosticMaster"
import { proctoService } from "@/lib/services/procto"
import DiagnosticOrderModal from "@/components/ui/procto/DiagnosticOrderModal"

export type { VisitDiagnostic }

type Props = {
  value: VisitDiagnostic[]
  onChange: (next: VisitDiagnostic[]) => void
  readOnly?: boolean
  practiceId?: string | null
  patientId?: string | null
  patientPhone?: string | null
  bookingId?: string | null
}

const TYPES = ["Laboratory", "Radiology", "Minor Procedure", "Surgery"] as const

export default function DiagnosticEntryTable({
  value,
  onChange,
  readOnly = false,
  practiceId,
  patientId,
  patientPhone,
  bookingId,
}: Props) {
  const [draft, setDraft] = useState<VisitDiagnostic>(emptyDiagnosticDraft)
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<DiagnosticCatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const locked = useMemo(
    () =>
      value.some(
        (d) =>
          d.isOrdered ||
          d.isHistorical ||
          d.status === "ordered" ||
          d.status === "completed",
      ) && readOnly,
    [value, readOnly],
  )

  async function search(q: string) {
    setQuery(q)
    setDraft((d) => ({ ...d, name: q }))
    if (!practiceId || q.trim().length < 1) {
      setSuggestions([])
      return
    }
    setSearching(true)
    const res = await proctoService.searchDiagnostics(q, practiceId, 12)
    setSearching(false)
    if (res.status === "successful" && Array.isArray(res.data)) {
      setSuggestions(res.data as DiagnosticCatalogItem[])
    } else {
      setSuggestions([])
    }
  }

  function pickSuggestion(item: DiagnosticCatalogItem) {
    setDraft(catalogToVisitLine(item))
    setQuery(item.name)
    setSuggestions([])
  }

  function addRow() {
    const name = draft.name.trim()
    if (!name) {
      toast.error("Enter a test description.")
      return
    }
    const exists = value.some(
      (d) => d.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (exists) {
      toast.info("That test is already on the order.")
      return
    }
    onChange([
      ...value,
      {
        ...draft,
        name,
        qty: Math.max(1, Number(draft.qty) || 1),
        type: draft.type || "Laboratory",
      },
    ])
    setDraft(emptyDiagnosticDraft())
    setQuery("")
    setSuggestions([])
  }

  function removeRow(index: number) {
    const row = value[index]
    if (
      row &&
      (row.isOrdered ||
        row.isHistorical ||
        row.status === "ordered" ||
        row.status === "completed")
    ) {
      toast.error("Ordered diagnostics cannot be removed.")
      return
    }
    onChange(value.filter((_, i) => i !== index))
  }

  function updateRow(index: number, patch: Partial<VisitDiagnostic>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addMany(lines: VisitDiagnostic[]) {
    const seen = new Set(value.map((d) => d.name.trim().toLowerCase()))
    const toAdd: VisitDiagnostic[] = []
    for (const line of lines) {
      const key = line.name.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      toAdd.push({
        ...line,
        qty: Math.max(1, Number(line.qty) || 1),
      })
    }
    if (!toAdd.length) {
      toast.info("Selected tests are already on the order.")
      return
    }
    onChange([...value, ...toAdd])
    toast.success(`Added ${toAdd.length} diagnostic order${toAdd.length === 1 ? "" : "s"}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Order labs, radiology, and procedures. Tick sheet, favorites, and prior
          orders refill the grid.
        </p>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800 cursor-pointer"
            >
              Favorites / Order sets / Previous
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-primary-foreground)] hover:bg-[var(--theme-primary-hover)] cursor-pointer"
            >
              Tick sheet
            </button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-3 py-2 w-12">SNo</th>
              <th className="px-3 py-2 w-36">Type</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 w-16">Qty</th>
              <th className="px-3 py-2">Instruction</th>
              {!readOnly ? <th className="px-3 py-2 w-16" /> : null}
            </tr>
          </thead>
          <tbody>
            {value.length === 0 ? (
              <tr>
                <td
                  colSpan={readOnly ? 5 : 6}
                  className="px-3 py-4 text-neutral-500 dark:text-neutral-400"
                >
                  No diagnostic orders yet.
                </td>
              </tr>
            ) : (
              value.map((row, index) => {
                const rowLocked =
                  readOnly ||
                  row.isOrdered ||
                  row.isHistorical ||
                  row.status === "ordered" ||
                  row.status === "completed"
                return (
                  <tr
                    key={`${row.name}-${index}`}
                    className="border-t border-neutral-100 dark:border-neutral-800"
                  >
                    <td className="px-3 py-2 tabular-nums text-neutral-500">
                      {index + 1}
                    </td>
                    <td className="px-3 py-2">
                      {rowLocked ? (
                        row.type || "—"
                      ) : (
                        <select
                          className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-600 dark:bg-neutral-900"
                          value={row.type || "Laboratory"}
                          onChange={(e) =>
                            updateRow(index, { type: e.target.value })
                          }
                        >
                          {TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-neutral-900 dark:text-white">
                      {row.name}
                      {row.code ? (
                        <span className="ml-2 text-xs font-normal text-neutral-400">
                          {row.code}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {rowLocked ? (
                        row.qty ?? 1
                      ) : (
                        <input
                          type="number"
                          min={1}
                          max={99}
                          className="w-14 rounded-md border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-600 dark:bg-neutral-900"
                          value={row.qty ?? 1}
                          onChange={(e) =>
                            updateRow(index, {
                              qty: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">
                      {rowLocked ? (
                        row.instruction || "—"
                      ) : (
                        <input
                          className="w-full min-w-[140px] rounded-md border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-600 dark:bg-neutral-900"
                          value={row.instruction || ""}
                          onChange={(e) =>
                            updateRow(index, { instruction: e.target.value })
                          }
                          placeholder="Patient prep / notes"
                        />
                      )}
                    </td>
                    {!readOnly ? (
                      <td className="px-3 py-2">
                        {!rowLocked ? (
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="text-rose-600 hover:underline cursor-pointer"
                          >
                            ✕
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && !locked ? (
        <div className="relative rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-600">
          <div className="grid gap-2 md:grid-cols-[140px_1fr_72px_1fr_auto]">
            <select
              className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              value={draft.type || "Laboratory"}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="relative">
              <input
                className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
                placeholder="Search or type test name"
                value={query}
                onChange={(e) => void search(e.target.value)}
              />
              {suggestions.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                        onClick={() => pickSuggestion(s)}
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-neutral-500">
                          {s.type || s.categoryCode}
                          {s.instruction ? ` · ${s.instruction}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {searching ? (
                <span className="absolute right-2 top-2 text-xs text-neutral-400">
                  …
                </span>
              ) : null}
            </div>
            <input
              type="number"
              min={1}
              max={99}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              value={draft.qty ?? 1}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  qty: Math.max(1, Number(e.target.value) || 1),
                }))
              }
            />
            <input
              className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              placeholder="Instruction"
              value={draft.instruction || ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, instruction: e.target.value }))
              }
            />
            <button
              type="button"
              onClick={addRow}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900 cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <DiagnosticOrderModal
          practiceId={practiceId}
          patientId={patientId}
          patientPhone={patientPhone}
          bookingId={bookingId}
          current={value}
          onClose={() => setModalOpen(false)}
          onAdd={addMany}
        />
      ) : null}
    </div>
  )
}
