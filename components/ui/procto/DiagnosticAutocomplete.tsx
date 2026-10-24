"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { proctoService } from "@/lib/services/procto"
import {
  diagnosticMatchesQuery,
  diagnosticTypeLabel,
  mergeDiagnosticCatalog,
  searchDiagnosticMaster,
  type DiagnosticCatalogItem,
} from "@/lib/diagnosticMaster"
import { dashboardPortalRoot } from "@/lib/portalRoot"

type Props = {
  value: string
  onChange: (value: string) => void
  onSelect?: (item: DiagnosticCatalogItem) => void
  onBlur?: () => void
  practiceId?: string | null
  /** Prefer showing this type first (Laboratory / Radiology / …). */
  preferredType?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  ariaLabel?: string
}

export default function DiagnosticAutocomplete({
  value,
  onChange,
  onSelect,
  onBlur,
  practiceId,
  preferredType,
  placeholder = "Search or type test name",
  className = "",
  disabled = false,
  ariaLabel = "Diagnostic test name",
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [catalog, setCatalog] = useState<DiagnosticCatalogItem[]>(() =>
    searchDiagnosticMaster("", 200),
  )
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const fieldRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listboxId = useId()
  const titleId = useId()

  useEffect(() => {
    setMounted(true)
  }, [])

  function openModal(seed?: string) {
    if (disabled) return
    setQuery(seed !== undefined ? seed : value || "")
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setActiveIndex(-1)
    onBlur?.()
    requestAnimationFrame(() => fieldRef.current?.focus())
  }

  // Load full practice master when the combo opens (local seed already shown).
  useEffect(() => {
    if (!isOpen) return
    let active = true
    setCatalog(searchDiagnosticMaster("", 200))
    setLoading(true)

    const load = async () => {
      try {
        if (practiceId) {
          const masters = await proctoService.listDiagnosticMasters({
            practiceId,
          })
          if (
            active &&
            masters?.status === "successful" &&
            masters.data &&
            Array.isArray((masters.data as { items?: unknown }).items)
          ) {
            const items = (masters.data as { items: unknown[] }).items
            setCatalog(
              mergeDiagnosticCatalog([
                ...searchDiagnosticMaster("", 200),
                ...(items as DiagnosticCatalogItem[]),
              ]),
            )
            return
          }
          const listed = await proctoService.listDiagnostics({
            practiceId,
            q: "",
          })
          if (
            active &&
            listed?.status === "successful" &&
            Array.isArray(listed.data)
          ) {
            setCatalog(
              mergeDiagnosticCatalog([
                ...searchDiagnosticMaster("", 200),
                ...(listed.data as DiagnosticCatalogItem[]),
              ]),
            )
          }
        }
      } catch {
        /* keep local seed */
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [isOpen, practiceId])

  const suggestions = (() => {
    const filtered = catalog.filter((d) => diagnosticMatchesQuery(d, query))
    if (!preferredType?.trim()) return filtered
    const pref = preferredType.trim().toLowerCase()
    return [...filtered].sort((a, b) => {
      const at = diagnosticTypeLabel(a.categoryCode, a.type).toLowerCase()
      const bt = diagnosticTypeLabel(b.categoryCode, b.type).toLowerCase()
      const aHit = at === pref || a.categoryCode.toLowerCase() === pref ? 0 : 1
      const bHit = bt === pref || b.categoryCode.toLowerCase() === pref ? 0 : 1
      if (aHit !== bHit) return aHit - bHit
      return a.name.localeCompare(b.name)
    })
  })()

  useEffect(() => {
    setActiveIndex(-1)
  }, [query, catalog])

  useEffect(() => {
    if (!isOpen) return
    const t = window.setTimeout(() => searchRef.current?.focus(), 30)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        closeModal()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen])

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement | undefined
      if (el) el.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex])

  function handleSelect(item: DiagnosticCatalogItem) {
    if (onSelect) onSelect(item)
    else onChange(item.name)
    closeModal()
  }

  function handleUseCustom() {
    const trimmed = query.trim()
    if (!trimmed) return
    onChange(trimmed)
    closeModal()
  }

  function handleFieldKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault()
      openModal(value)
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % suggestions.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((prev) =>
          prev <= 0 ? suggestions.length - 1 : prev - 1,
        )
        return
      }
      if (e.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault()
        handleSelect(suggestions[activeIndex]!)
        return
      }
    }
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault()
      handleUseCustom()
    }
  }

  const modal =
    mounted && isOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[220] flex items-end justify-center bg-black/40 p-3 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeModal()
            }}
          >
            <div className="flex max-h-[min(92vh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-950">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <div>
                  <h3
                    id={titleId}
                    className="text-base font-bold text-neutral-900 dark:text-white"
                  >
                    Select diagnostic test
                  </h3>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    All tests from the diagnostic master. Type to filter, or
                    scroll to find.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="shrink-0 border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search name or code (e.g. FBS, US Abdomen)…"
                  aria-controls={listboxId}
                  aria-label="Search diagnostic tests"
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[var(--theme-primary)] focus:ring-2 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
                  <span>
                    {loading
                      ? "Loading master list…"
                      : `${suggestions.length} test${suggestions.length === 1 ? "" : "s"}`}
                    {preferredType ? ` · ${preferredType} first` : ""}
                  </span>
                  {query.trim() ? (
                    <button
                      type="button"
                      onClick={handleUseCustom}
                      className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-200 cursor-pointer"
                    >
                      Use “{query.trim()}” as custom
                    </button>
                  ) : null}
                </div>
              </div>

              <ul
                id={listboxId}
                ref={listRef}
                role="listbox"
                className="min-h-0 flex-1 overflow-y-auto py-1 text-sm custom-scroll"
              >
                {suggestions.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No matching tests in the master list.
                    <div className="mt-2 text-xs text-neutral-400">
                      {query.trim()
                        ? "Use the custom name button above, or refine your search."
                        : "Master list is empty for this practice."}
                    </div>
                  </li>
                ) : (
                  suggestions.map((item, idx) => {
                    const isSelected = idx === activeIndex
                    const typeLabel = diagnosticTypeLabel(
                      item.categoryCode,
                      item.type,
                    )
                    return (
                      <li
                        key={item.id || item.code || `${item.name}-${idx}`}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`cursor-pointer px-4 py-2.5 transition-colors ${
                          isSelected
                            ? "bg-sky-50 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100"
                            : "text-neutral-800 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-neutral-900 dark:text-white">
                            {item.name}
                          </span>
                          <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                            {typeLabel}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500 dark:text-neutral-400">
                          {item.code ? (
                            <span className="font-mono text-[10px]">
                              {item.code}
                            </span>
                          ) : null}
                          {item.instruction ? (
                            <span className="truncate">{item.instruction}</span>
                          ) : null}
                        </div>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
          </div>,
          dashboardPortalRoot(),
        )
      : null

  return (
    <div className="relative w-full">
      <input
        ref={fieldRef}
        type="text"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        title="Click or double-click to browse the diagnostic master"
        className={`${className} cursor-pointer`}
        onChange={(e) => {
          onChange(e.target.value)
          openModal(e.target.value)
        }}
        onClick={() => openModal(value)}
        onDoubleClick={() => openModal(value)}
        onKeyDown={handleFieldKeyDown}
      />
      {modal}
    </div>
  )
}
