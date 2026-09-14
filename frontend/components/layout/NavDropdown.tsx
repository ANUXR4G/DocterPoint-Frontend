"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"

export type NavOption = {
  label: string
  href: string
  description?: string
}

type NavDropdownProps = {
  label: string
  options: NavOption[]
  active?: boolean
  arrow?: boolean
}

function NavArrow({ open }: { open?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 15 9"
      className={`gg-home-nav__svg-arrow ${open ? "is-open" : ""}`}
      aria-hidden
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        d="M13.5 4.5H.5m13 0-4-4m4 4-4 4"
      />
    </svg>
  )
}

export default function NavDropdown({
  label,
  options,
  active,
  arrow = true,
}: NavDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className="gg-home-nav__dd relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={`gg-home-nav__link ${active || open ? "is-active" : ""}`}
      >
        {arrow ? <NavArrow open={open} /> : null}
        {label}
      </button>

      {open ? (
        <div id={menuId} role="menu" className="gg-home-nav__dd-panel">
          <div className="gg-home-nav__menu">
            {options.map((opt) => (
              <Link
                key={opt.href + opt.label}
                href={opt.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="gg-home-nav__menu-item"
              >
                <span className="block">{opt.label}</span>
                {opt.description ? (
                  <span className="gg-home-nav__menu-desc">{opt.description}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
