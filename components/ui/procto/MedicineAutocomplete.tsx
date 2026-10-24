"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { proctoService } from "@/lib/services/procto"
import {
  searchMedicineMaster,
  type MedicineMasterItem,
} from "@/lib/medicineMaster"
import { dashboardPortalRoot } from "@/lib/portalRoot"

type Props = {
  value: string
  onChange: (value: string) => void
  onSelect?: (med: MedicineMasterItem) => void
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  ariaLabel?: string
  autoFocus?: boolean
  favourite?: boolean
  onToggleFavourite?: (favourite: boolean) => void
}

export default function MedicineAutocomplete({
  value,
  onChange,
  onSelect,
  onBlur,
  onKeyDown,
  placeholder = "Type to search med",
  className = "",
  disabled = false,
  ariaLabel = "Medicine name",
  autoFocus = false,
  favourite,
  onToggleFavourite,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<MedicineMasterItem[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listboxId = useId()
  const titleId = useId()

  useEffect(() => {
    setMounted(true)
  }, [])

  const isCurrentFav =
    favourite !== undefined
      ? Boolean(favourite)
      : Boolean(
          suggestions.find(
            (s) => s.name.toLowerCase() === (value || "").trim().toLowerCase(),
          )?.favourite,
        )

  function openModal(seed?: string) {
    if (disabled) return
    setQuery(seed !== undefined ? seed : value || "")
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setActiveIndex(-1)
    onBlur?.()
    // Return focus to the row field after close.
    requestAnimationFrame(() => fieldRef.current?.focus())
  }

  useEffect(() => {
    if (!isOpen) return
    let active = true
    const q = query.trim()
    const instant = searchMedicineMaster(q, 40)
    setSuggestions(instant)
    setLoading(true)
    proctoService
      .searchMedicines(q, 40)
      .then((items) => {
        if (active && items && items.length > 0) {
          setSuggestions(items)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [query, isOpen])

  useEffect(() => {
    setActiveIndex(-1)
  }, [suggestions])

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

  function handleSelect(med: MedicineMasterItem) {
    if (onSelect) {
      onSelect(med)
    } else {
      onChange(med.brandName || med.name)
    }
    closeModal()
  }

  function handleUseCustom() {
    const trimmed = query.trim()
    if (!trimmed) return
    onChange(trimmed)
    closeModal()
  }

  function handleToggleInputFav(e: React.MouseEvent) {
    e.stopPropagation()
    const nextFav = !isCurrentFav
    onToggleFavourite?.(nextFav)
    const matched = suggestions.find(
      (s) => s.name.toLowerCase() === (value || "").trim().toLowerCase(),
    )
    if (matched?.id) {
      proctoService.toggleMedicineFavourite(matched.id, nextFav).catch(() => {})
      setSuggestions((prev) =>
        prev.map((item) =>
          item.id === matched.id ? { ...item, favourite: nextFav } : item,
        ),
      )
    }
  }

  function handleToggleItemFav(e: React.MouseEvent, med: MedicineMasterItem) {
    e.stopPropagation()
    const nextFav = !med.favourite
    setSuggestions((prev) =>
      prev.map((item) =>
        item.id === med.id ? { ...item, favourite: nextFav } : item,
      ),
    )
    if ((value || "").trim().toLowerCase() === med.name.toLowerCase()) {
      onToggleFavourite?.(nextFav)
    }
    if (med.id) {
      proctoService.toggleMedicineFavourite(med.id, nextFav).catch(() => {})
    }
  }

  function handleFieldKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      onKeyDown?.(e)
      return
    }
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault()
      openModal(value)
      return
    }
    onKeyDown?.(e)
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
        handleSelect(suggestions[activeIndex])
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
                    Select medicine
                  </h3>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    Search the medicine master inventory, or use a custom name.
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
                  placeholder="Search brand, generic, or strength…"
                  aria-controls={listboxId}
                  aria-label="Search medicines"
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[var(--theme-primary)] focus:ring-2 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      ★ Fav
                    </span>
                    <span>/</span>
                    <span className="font-medium text-orange-500">★ Non-Fav</span>
                    {loading ? (
                      <span className="ml-1 animate-pulse">Searching…</span>
                    ) : null}
                  </div>
                  {query.trim() ? (
                    <button
                      type="button"
                      onClick={handleUseCustom}
                      className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/60 cursor-pointer"
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
                    No matching medicines in the master list.
                    <div className="mt-2 text-xs text-neutral-400">
                      {query.trim()
                        ? "Use the custom name button above, or refine your search."
                        : "Start typing to search."}
                    </div>
                  </li>
                ) : (
                  suggestions.map((med, idx) => {
                    const isSelected = idx === activeIndex
                    const isFav = Boolean(med.favourite)
                    return (
                      <li
                        key={med.id || med.medicineCode || `${med.name}-${idx}`}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(med)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`cursor-pointer px-4 py-2.5 transition-colors ${
                          isSelected
                            ? "bg-sky-50 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100"
                            : "text-neutral-800 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              type="button"
                              tabIndex={-1}
                              aria-label={
                                isFav
                                  ? "In favorite list (click to remove)"
                                  : "Add to favorite list"
                              }
                              title={
                                isFav
                                  ? "In favorite list (green star) — click to remove"
                                  : "Not in favorite list (orange star) — click to add"
                              }
                              onClick={(e) => handleToggleItemFav(e, med)}
                              className={`flex size-5 shrink-0 items-center justify-center rounded transition-all active:scale-90 hover:scale-110 cursor-pointer ${
                                isFav
                                  ? "text-emerald-500 hover:text-emerald-600"
                                  : "text-orange-500 hover:text-orange-600"
                              }`}
                            >
                              <svg
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="size-4"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                            <span className="truncate font-semibold text-neutral-900 dark:text-white">
                              {med.brandName || med.name}
                            </span>
                          </div>
                          {med.category ? (
                            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                              {med.category}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-7 text-xs text-neutral-500 dark:text-neutral-400">
                          {med.genericName ? <span>{med.genericName}</span> : null}
                          {med.strength ? (
                            <span className="rounded bg-sky-100/70 px-1 text-[10px] text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                              {med.strength}
                            </span>
                          ) : null}
                          {med.route ? (
                            <span className="text-[10px] text-neutral-400">
                              · {med.route}
                            </span>
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
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={fieldRef}
          type="text"
          role="button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          disabled={disabled}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          readOnly
          className={`${className} ${value ? "pr-7" : ""} cursor-pointer`}
          onClick={() => openModal(value)}
          onKeyDown={handleFieldKeyDown}
        />

        {value ? (
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={
              isCurrentFav
                ? "In favorite list (click to remove)"
                : "Add to favorite list"
            }
            title={
              isCurrentFav
                ? "In favorite list (click to remove)"
                : "Add to favorite list"
            }
            onClick={handleToggleInputFav}
            className={`absolute right-1.5 flex size-5 items-center justify-center transition-all active:scale-90 hover:scale-110 cursor-pointer ${
              isCurrentFav
                ? "text-emerald-500 hover:text-emerald-600 drop-shadow-xs"
                : "text-orange-500 hover:text-orange-600"
            }`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path
                fillRule="evenodd"
                d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : null}
      </div>
      {modal}
    </div>
  )
}
