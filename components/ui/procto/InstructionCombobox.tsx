"use client"

import { useEffect, useLayoutEffect, useRef, useState, useId } from "react"
import { createPortal } from "react-dom"
import { proctoService } from "@/lib/services/procto"
import { dashboardPortalRoot } from "@/lib/portalRoot"

export const COMMON_INSTRUCTIONS: string[] = [
  "After food",
  "Before food",
  "With or after food",
  "With food",
  "Empty stomach",
  "Empty stomach in morning",
  "Before breakfast",
  "30 min before breakfast",
  "With breakfast",
  "With evening meal",
  "Take at night",
  "Take at bedtime",
  "With or without food",
  "As needed",
  "As needed for pain / fever",
  "Every 6-8 hours as needed",
  "1 hour before or 2 hours after meals",
  "At start of meal",
  "Strictly after meals with water",
  "Complete full course",
  "May cause mild drowsiness",
  "Dissolve in warm water",
  "Do not crush or chew",
]

export const PREDEFINED_INSTRUCTION_GROUPS = [
  {
    category: "Meal Timing",
    icon: "🍽️",
    items: [
      "After food",
      "Before food",
      "With or after food",
      "With food",
      "Empty stomach",
    ],
  },
  {
    category: "Daily Schedule",
    icon: "⏰",
    items: [
      "Before breakfast",
      "30 min before breakfast",
      "With breakfast",
      "With evening meal",
      "Take at night",
      "Take at bedtime",
    ],
  },
  {
    category: "Administration & Precautions",
    icon: "💊",
    items: [
      "Complete full course",
      "Dissolve in warm water",
      "Do not crush or chew",
      "Strictly after meals with water",
      "May cause mild drowsiness",
    ],
  },
  {
    category: "As Needed (PRN)",
    icon: "⚡",
    items: [
      "As needed",
      "As needed for pain / fever",
      "Every 6-8 hours as needed",
      "1 hour before or 2 hours after meals",
    ],
  },
]

// Global in-memory cache shared among all InstructionCombobox instances
let instructionsCache: string[] = [...COMMON_INSTRUCTIONS]
const listeners = new Set<(items: string[]) => void>()
let isFetching = false

export function getGlobalInstructions(): string[] {
  return instructionsCache
}

export function registerCustomInstruction(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  const lower = trimmed.toLowerCase()
  if (instructionsCache.some((i) => i.toLowerCase() === lower)) return
  instructionsCache = [...instructionsCache, trimmed]
  listeners.forEach((fn) => fn(instructionsCache))
}

function loadDynamicInstructions() {
  if (isFetching) return
  isFetching = true
  proctoService
    .listInstructions()
    .then((res) => {
      if (res && res.status === "successful" && res.data) {
        const raw = res.data as { instructions?: string[] }
        if (Array.isArray(raw.instructions)) {
          const seen = new Set(instructionsCache.map((i) => i.toLowerCase()))
          const toAdd: string[] = []
          for (const item of raw.instructions) {
            if (typeof item === "string" && item.trim() && !seen.has(item.trim().toLowerCase())) {
              seen.add(item.trim().toLowerCase())
              toAdd.push(item.trim())
            }
          }
          if (toAdd.length > 0) {
            instructionsCache = [...instructionsCache, ...toAdd]
            listeners.forEach((fn) => fn(instructionsCache))
          }
        }
      }
    })
    .catch(() => {
      // Ignore network errors, fall back to cached instructions
    })
    .finally(() => {
      isFetching = false
    })
}

type Props = {
  value: string
  onChange: (value: string) => void
  onCommit?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  ariaLabel?: string
  options?: string[]
}

export default function InstructionCombobox({
  value,
  onChange,
  onCommit,
  placeholder = "Select or type...",
  className = "",
  disabled = false,
  ariaLabel = "Special instruction",
  options,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [instructionsList, setInstructionsList] = useState<string[]>(
    options || instructionsCache,
  )
  const [floatPos, setFloatPos] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
    placeAbove: boolean
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  function syncFloatPos(preferWidth: number) {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(preferWidth, window.innerWidth - 16)
    let left = r.left
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8)
    }
    const spaceBelow = window.innerHeight - r.bottom - 8
    const spaceAbove = r.top - 8
    const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow
    const maxHeight = Math.min(320, Math.max(140, placeAbove ? spaceAbove : spaceBelow))
    setFloatPos({
      top: placeAbove ? r.top - 4 : r.bottom + 4,
      left,
      width,
      maxHeight,
      placeAbove,
    })
  }

  // Subscribe to dynamic instructions updates
  useEffect(() => {
    if (options) {
      setInstructionsList(options)
      return
    }
    loadDynamicInstructions()
    const handleUpdate = (next: string[]) => setInstructionsList(next)
    listeners.add(handleUpdate)
    return () => {
      listeners.delete(handleUpdate)
    }
  }, [options])

  const query = (value || "").trim().toLowerCase()

  // Filter instructions based on what clinician typed
  const filtered = instructionsList.filter((item) =>
    item.toLowerCase().includes(query),
  )

  // Has exact match in instructions list?
  const hasExactMatch = instructionsList.some(
    (item) => item.toLowerCase() === query,
  )

  // Commit value and auto-save new custom instruction if needed
  function commitValue(val: string) {
    const trimmed = (val || "").trim()
    if (trimmed) {
      const isPreset = COMMON_INSTRUCTIONS.some(
        (i) => i.toLowerCase() === trimmed.toLowerCase(),
      )
      const isKnown = instructionsList.some(
        (i) => i.toLowerCase() === trimmed.toLowerCase(),
      )
      if (!isKnown) {
        registerCustomInstruction(trimmed)
      }
      if (!isPreset) {
        // Auto-save brand new custom instruction for future selections
        proctoService.saveCustomInstruction(trimmed).catch(() => {})
      }
    }
    onCommit?.(val)
  }

  // Reset active index when query or filtered list changes
  useEffect(() => {
    setActiveIndex(-1)
  }, [value])

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement | undefined
      if (el) {
        el.scrollIntoView({ block: "nearest" })
      }
    }
  }, [activeIndex])

  useLayoutEffect(() => {
    if (!isOpen && !showBanner) {
      setFloatPos(null)
      return
    }
    syncFloatPos(showBanner ? 384 : 280)
    const onMove = () => syncFloatPos(showBanner ? 384 : 280)
    window.addEventListener("resize", onMove)
    window.addEventListener("scroll", onMove, true)
    return () => {
      window.removeEventListener("resize", onMove)
      window.removeEventListener("scroll", onMove, true)
    }
  }, [isOpen, showBanner])

  // Handle outside click to close dropdown and banner
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      if (bannerRef.current?.contains(t)) return
      setIsOpen(false)
      setShowBanner(false)
      commitValue(value)
    }
    if (isOpen || showBanner) {
      document.addEventListener("pointerdown", handlePointerDown)
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown)
      }
    }
  }, [isOpen, showBanner, value])

  function handleSelect(instruction: string) {
    onChange(instruction)
    commitValue(instruction)
    setIsOpen(false)
    setShowBanner(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setActiveIndex(0)
      } else {
        setActiveIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0,
        )
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setActiveIndex(filtered.length - 1)
      } else {
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1,
        )
      }
    } else if (e.key === "Enter") {
      if (isOpen && activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault()
        handleSelect(filtered[activeIndex])
      } else {
        // Commit whatever custom text is typed
        setIsOpen(false)
        commitValue(value)
      }
    } else if (e.key === "Escape") {
      setIsOpen(false)
      setShowBanner(false)
    } else if (e.key === "Tab") {
      setIsOpen(false)
      setShowBanner(false)
      commitValue(value)
    }
  }

  const floatStyle = floatPos
    ? {
        top: floatPos.placeAbove ? undefined : floatPos.top,
        bottom: floatPos.placeAbove
          ? window.innerHeight - floatPos.top
          : undefined,
        left: floatPos.left,
        width: floatPos.width,
        maxHeight: floatPos.maxHeight,
      }
    : undefined

  const banner =
    showBanner && floatPos
      ? createPortal(
          <div
            ref={bannerRef}
            className="fixed z-[220] overflow-hidden rounded-xl border border-sky-300 bg-white p-3 shadow-2xl dark:border-sky-900/60 dark:bg-neutral-900"
            style={floatStyle}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-900 dark:text-sky-300">
                <span className="flex size-5 items-center justify-center rounded-full bg-sky-100 text-[11px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  ⚡
                </span>
                <span>Predefined Special Instructions</span>
              </div>
              <button
                type="button"
                onClick={() => setShowBanner(false)}
                className="rounded p-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ✕
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
              Click any predefined value to fill into the box. You can freely
              edit, append, or modify the text after selecting.
            </p>

            <div
              className="mt-2.5 space-y-2.5 overflow-y-auto pr-1 text-xs custom-scroll"
              style={{ maxHeight: Math.max(100, floatPos.maxHeight - 88) }}
            >
              {PREDEFINED_INSTRUCTION_GROUPS.map((group) => (
                <div key={group.category}>
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    <span>{group.icon}</span>
                    <span>{group.category}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          onChange(item)
                          commitValue(item)
                          setShowBanner(false)
                          inputRef.current?.focus()
                        }}
                        className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-800 transition-colors hover:border-sky-400 hover:bg-sky-50 hover:text-sky-950 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-sky-600 dark:hover:bg-sky-950/60 dark:hover:text-sky-200 cursor-pointer"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          dashboardPortalRoot(),
        )
      : null

  const menu =
    isOpen && !showBanner && floatPos
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[220] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
            style={floatStyle}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="border-b border-neutral-100 bg-neutral-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/80 dark:text-neutral-400">
              Special Instructions
            </div>

            <ul
              id={listboxId}
              ref={listRef}
              role="listbox"
              className="overflow-y-auto py-1 text-xs custom-scroll"
              style={{ maxHeight: Math.max(80, floatPos.maxHeight - 28) }}
            >
              {filtered.length === 0 ? (
                <li
                  role="option"
                  aria-selected
                  onClick={() => handleSelect(value.trim())}
                  className="cursor-pointer px-3 py-2.5 text-xs text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  <div className="font-medium text-neutral-700 dark:text-neutral-300">
                    Custom instruction:
                  </div>
                  <div className="mt-0.5 truncate font-semibold text-sky-600 dark:text-sky-400">
                    &ldquo;{value}&rdquo;
                  </div>
                  <div className="mt-1 text-[10px] text-neutral-400">
                    Press Enter or click to save for future selections.
                  </div>
                </li>
              ) : (
                <>
                  {filtered.map((instruction, idx) => {
                    const isSelected = idx === activeIndex
                    const isCurrent =
                      instruction.toLowerCase() === value.trim().toLowerCase()
                    return (
                      <li
                        key={instruction}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(instruction)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`cursor-pointer px-3 py-1.5 transition-colors ${
                          isSelected
                            ? "bg-sky-50 text-sky-950 font-semibold dark:bg-sky-950/60 dark:text-sky-100"
                            : isCurrent
                              ? "bg-neutral-50 font-medium text-sky-700 dark:bg-neutral-800/80 dark:text-sky-300"
                              : "text-neutral-800 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{instruction}</span>
                          {isCurrent ? (
                            <span className="text-[10px] text-sky-600 dark:text-sky-400">
                              ✓
                            </span>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}

                  {value.trim() && !hasExactMatch ? (
                    <li
                      role="option"
                      aria-selected={activeIndex === filtered.length}
                      onClick={() => handleSelect(value.trim())}
                      onMouseEnter={() => setActiveIndex(filtered.length)}
                      className="border-t border-neutral-100 px-3 py-1.5 text-xs text-sky-700 transition-colors hover:bg-sky-50 dark:border-neutral-800 dark:text-sky-300 dark:hover:bg-neutral-800 cursor-pointer"
                    >
                      <span className="text-[11px] font-normal text-neutral-400">
                        Use custom:
                      </span>{" "}
                      <span className="font-semibold">
                        &ldquo;{value}&rdquo;
                      </span>
                    </li>
                  ) : null}
                </>
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
          value={value}
          placeholder={placeholder}
          className={`${className} pr-20`}
          onChange={(e) => {
            onChange(e.target.value)
            if (!isOpen) setIsOpen(true)
            if (showBanner) setShowBanner(false)
          }}
          onFocus={() => {
            if (!showBanner) setIsOpen(true)
          }}
          onBlur={() => {
            setTimeout(() => {
              const active = document.activeElement
              if (
                active &&
                (containerRef.current?.contains(active) ||
                  menuRef.current?.contains(active) ||
                  bannerRef.current?.contains(active))
              ) {
                return
              }
              setIsOpen(false)
              commitValue(value)
            }, 180)
          }}
          onKeyDown={handleKeyDown}
        />

        <div className="absolute right-1 flex items-center gap-1">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Quick predefined instructions banner"
            title="Click to view and choose predefined instructions banner"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation()
              setShowBanner((prev) => !prev)
              setIsOpen(false)
            }}
            className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-all active:scale-95 ${
              showBanner
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-900 dark:bg-sky-950/70 dark:text-sky-300 dark:hover:bg-sky-900/80"
            }`}
          >
            <span>⚡</span>
            <span>Presets</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={isOpen ? "Close instructions" : "Open instructions"}
            disabled={disabled}
            onClick={() => {
              if (isOpen) {
                setIsOpen(false)
              } else {
                setIsOpen(true)
                setShowBanner(false)
                inputRef.current?.focus()
              }
            }}
            className="flex size-5 items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <svg
              className={`size-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
      {banner}
      {menu}
    </div>
  )
}

