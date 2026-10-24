"use client"

import { useEffect, useLayoutEffect, useRef, useState, useId } from "react"
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
  const [suggestions, setSuggestions] = useState<MedicineMasterItem[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [menuPos, setMenuPos] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
    placeAbove: boolean
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  function syncMenuPos() {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(320, Math.max(r.width, 220), window.innerWidth - 16)
    let left = r.left
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8)
    }
    const spaceBelow = window.innerHeight - r.bottom - 8
    const spaceAbove = r.top - 8
    const placeAbove = spaceBelow < 200 && spaceAbove > spaceBelow
    const maxHeight = Math.min(280, Math.max(120, placeAbove ? spaceAbove : spaceBelow))
    const top = placeAbove ? r.top - 4 : r.bottom + 4
    setMenuPos({ top, left, width, maxHeight, placeAbove })
  }

  // Determine if currently selected value is a favourite
  const isCurrentFav =
    favourite !== undefined
      ? Boolean(favourite)
      : Boolean(
          suggestions.find(
            (s) => s.name.toLowerCase() === (value || "").trim().toLowerCase(),
          )?.favourite,
        )

  // Fetch or filter options whenever value changes or dropdown opens
  useEffect(() => {
    if (!isOpen) return

    let active = true
    const q = (value || "").trim()

    // Immediate fast local filter first
    const instant = searchMedicineMaster(q, 25)
    setSuggestions(instant)

    // Then async backend query
    setLoading(true)
    proctoService
      .searchMedicines(q, 30)
      .then((items) => {
        if (active && items && items.length > 0) {
          setSuggestions(items)
        }
      })
      .catch(() => {
        // silent fallback to instant local
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [value, isOpen])

  // Reset highlighted item when suggestions change
  useEffect(() => {
    setActiveIndex(-1)
  }, [suggestions])

  // Keep portaled menu aligned while open (table scroll / resize).
  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPos(null)
      return
    }
    syncMenuPos()
    const onMove = () => syncMenuPos()
    window.addEventListener("resize", onMove)
    window.addEventListener("scroll", onMove, true)
    return () => {
      window.removeEventListener("resize", onMove)
      window.removeEventListener("scroll", onMove, true)
    }
  }, [isOpen])

  // Close on outside click (input + portaled menu)
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  function handleSelect(med: MedicineMasterItem) {
    setIsOpen(false)
    if (onSelect) {
      onSelect(med)
    } else {
      onChange(med.brandName || med.name)
    }
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
    med.favourite = nextFav
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (isOpen && suggestions.length > 0) {
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
      if (e.key === "Escape") {
        e.preventDefault()
        setIsOpen(false)
        return
      }
    }

    onKeyDown?.(e)
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement | undefined
      if (el) {
        el.scrollIntoView({ block: "nearest" })
      }
    }
  }, [activeIndex])

  const menu =
    isOpen && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[220] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
            style={{
              top: menuPos.placeAbove ? undefined : menuPos.top,
              bottom: menuPos.placeAbove
                ? window.innerHeight - menuPos.top
                : undefined,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/80 dark:text-neutral-400">
              <span>Medicine Master Inventory</span>
              <div className="flex items-center gap-1.5 text-[10px] font-normal normal-case text-neutral-400">
                <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  ★ Fav
                </span>
                <span>/</span>
                <span className="flex items-center gap-0.5 text-orange-500 font-medium">
                  ★ Non-Fav
                </span>
                {loading ? <span className="ml-1 animate-pulse">…</span> : null}
              </div>
            </div>

            <ul
              id={listboxId}
              ref={listRef}
              role="listbox"
              className="overflow-y-auto py-1 text-xs custom-scroll"
              style={{ maxHeight: Math.max(80, menuPos.maxHeight - 36) }}
            >
              {suggestions.length === 0 ? (
                <li className="px-3 py-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
                  No matching medicines found in master database.
                  <div className="mt-1 text-[11px] text-neutral-400">
                    You can still use custom typed name.
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
                      className={`cursor-pointer px-3 py-2 transition-colors ${
                        isSelected
                          ? "bg-sky-50 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100"
                          : "text-neutral-800 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
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
                                ? "In favorite list (green star) - click to remove"
                                : "Not in favorite list (orange star) - click to add"
                            }
                            onClick={(e) => handleToggleItemFav(e, med)}
                            className={`flex size-4.5 shrink-0 items-center justify-center rounded transition-all active:scale-90 hover:scale-125 cursor-pointer ${
                              isFav
                                ? "text-emerald-500 hover:text-emerald-600"
                                : "text-orange-500 hover:text-orange-600"
                            }`}
                          >
                            <svg
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="size-3.5"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                          <span className="font-semibold text-neutral-900 dark:text-white truncate">
                            {med.brandName || med.name}
                          </span>
                        </div>
                        {med.category ? (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 shrink-0">
                            {med.category}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {med.genericName ? <span>{med.genericName}</span> : null}
                        {med.strength ? (
                          <span className="rounded bg-sky-100/70 px-1 py-0.2 text-[10px] text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
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
          </div>,
          dashboardPortalRoot(),
        )
      : null

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-label={ariaLabel}
          disabled={disabled}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          className={`${className} ${value ? "pr-7" : ""}`}
          onChange={(e) => {
            onChange(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => {
            setIsOpen(true)
          }}
          onClick={() => {
            if (!isOpen) setIsOpen(true)
          }}
          onBlur={() => {
            // small delay to allow item click
            setTimeout(() => {
              const active = document.activeElement
              if (
                active &&
                (containerRef.current?.contains(active) ||
                  menuRef.current?.contains(active))
              ) {
                return
              }
              setIsOpen(false)
              onBlur?.()
            }, 200)
          }}
          onKeyDown={handleKeyDown}
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
      {menu}
    </div>
  )
}
