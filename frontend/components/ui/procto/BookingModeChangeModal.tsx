"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"

type Props = {
  open: boolean
  fromLabel: string
  toLabel: string
  confirming?: boolean
  error?: string
  onCancel: () => void
  onConfirm: () => void
}

/** Confirm Time slots ↔ Token queue switch (takes effect next clinic day). */
export default function BookingModeChangeModal({
  open,
  fromLabel,
  toLabel,
  confirming = false,
  error = "",
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-mode-change-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirming) onCancel()
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <h2
          id="booking-mode-change-title"
          className="text-lg font-semibold text-neutral-900 dark:text-white"
        >
          Confirm booking type change
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          Switch from <strong>{fromLabel}</strong> to <strong>{toLabel}</strong>
          ?
        </p>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          After you confirm, the new type takes effect from{" "}
          <strong>tomorrow</strong>. Today&apos;s appointments keep{" "}
          {fromLabel}.
        </p>
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="min-h-11 rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {confirming ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
