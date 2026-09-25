"use client"

import React, { useRef, useState } from "react"
import { Icon } from "@/components"
import DocumentScanPreview from "@/components/inputs/DocumentScanPreview"
import { prepareIdScanImage } from "@/lib/prepareIdScanImage"
import {
  userService,
  type ProfessionalScanResult,
} from "@/lib/services/user"

type Audience = "doctor" | "clinic"

type Props = {
  audience: Audience
  onExtract: (data: ProfessionalScanResult) => void
}

const COPY: Record<
  Audience,
  { title: string; hint: string; button: string; loading: string }
> = {
  doctor: {
    title: "Upload visiting card or licence",
    hint: "Visiting card, medical council licence, or letterhead — we fill name, licence number, and email below.",
    button: "Add document photo",
    loading: "Reading document…",
  },
  clinic: {
    title: "Upload visiting card or clinic document",
    hint: "Clinic visiting card, letterhead, or registration certificate — we fill clinic details below.",
    button: "Add document photo",
    loading: "Reading document…",
  },
}

export default function ProfessionalDocumentScan({
  audience,
  onExtract,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const copy = COPY[audience]
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setError(null)
    setMessage(null)
    setFileName(file.name)

    if (!file.type.startsWith("image/")) {
      setError("Please upload a JPG, PNG, or WEBP photo.")
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("Image must be under 6 MB.")
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setPreview(previewUrl)
    setIsLoading(true)

    try {
      const { base64, mimeType } = await prepareIdScanImage(file)
      const res = await userService.scanProfessionalDocumentGuest({
        imageBase64: base64,
        mimeType,
      })

      if (!res.data) {
        throw new Error("No details returned from scan.")
      }

      onExtract(res.data)

      const filled = [
        res.data.name && "name",
        res.data.clinicName && "clinic",
        res.data.licenseNo && "licence",
        res.data.registrationNo && "reg no",
        res.data.email && "email",
        res.data.phone && "phone",
        res.data.address && "address",
        res.data.specialty && "specialty",
      ].filter(Boolean)

      setMessage(
        filled.length > 0
          ? `Read ${res.data.documentType?.replace(/_/g, " ").toLowerCase() || "document"} — filled ${filled.join(", ")}. Review below.`
          : "Document saved — enter details manually if scan did not fill them.",
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read the document. Try a clearer photo.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full min-w-0 rounded-[16px] border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white p-3 dark:border-white/15 dark:from-slate-800 dark:to-slate-800/70 sm:rounded-[20px] sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--theme-primary)_16%,transparent)] dark:bg-[color-mix(in_srgb,var(--theme-primary)_22%,transparent)]">
          <Icon
            name="written-page"
            className="size-5"
            pathClassName="stroke-[var(--theme-primary)]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {copy.title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {copy.hint}
          </p>

          <div className="mt-3 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white transition hover:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-[#0f172a] sm:w-auto sm:min-h-10"
            >
              <Icon
                name="image-upload"
                className="size-4 shrink-0"
                pathClassName="stroke-current"
              />
              {isLoading ? copy.loading : copy.button}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              className="hidden"
              onChange={handleFile}
            />
            {fileName && !isLoading ? (
              <span className="max-w-full truncate text-center text-xs text-slate-500 dark:text-slate-400 sm:max-w-[14rem] sm:text-left">
                {fileName}
              </span>
            ) : null}
          </div>

          {preview ? (
            <div className="mt-3 max-w-sm">
              <DocumentScanPreview
                src={preview}
                alt="Document preview"
                fileName={fileName ?? undefined}
                scanning={isLoading}
              />
            </div>
          ) : null}

          {message ? (
            <p className="mt-2 break-words text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 break-words text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
