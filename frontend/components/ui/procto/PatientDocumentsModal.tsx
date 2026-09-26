"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { Paperclip, X, ExternalLink, FileText } from "lucide-react"
import { formatPracticeDateTime } from "@/lib/practiceTime"

export type PatientDocumentItem = {
  name: string
  url: string
  uploadedAt?: string
}

type Props = {
  open: boolean
  patientName?: string | null
  documents: PatientDocumentItem[]
  onClose: () => void
}

/** Lists a patient's general / WhatsApp documents in a centered modal. */
export default function PatientDocumentsModal({
  open,
  patientName,
  documents,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  const title = patientName?.trim()
    ? `Documents · ${patientName.trim()}`
    : "Documents"

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-documents-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[min(80vh,32rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-700">
          <div className="min-w-0">
            <h2
              id="patient-documents-title"
              className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white"
            >
              <Paperclip
                className="size-5 shrink-0 text-[var(--theme-primary)]"
                aria-hidden
              />
              <span className="truncate">{title}</span>
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {documents.length === 0
                ? "No documents uploaded yet."
                : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            aria-label="Close documents"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-600 dark:text-neutral-400">
              No attachments on this patient record.
            </div>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li key={`${doc.url}-${doc.name}`}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 rounded-xl border border-neutral-200 px-3 py-3 transition hover:border-[var(--theme-primary)]/40 hover:bg-[var(--theme-primary)]/5 dark:border-neutral-700 dark:hover:bg-[var(--theme-primary)]/10"
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      <FileText className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-900 group-hover:text-[var(--theme-primary)] dark:text-white">
                        {doc.name || "Document"}
                      </span>
                      {doc.uploadedAt ? (
                        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                          {formatPracticeDateTime(doc.uploadedAt)}
                        </span>
                      ) : null}
                    </span>
                    <ExternalLink
                      className="mt-1 size-4 shrink-0 text-neutral-400 group-hover:text-[var(--theme-primary)]"
                      aria-hidden
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
