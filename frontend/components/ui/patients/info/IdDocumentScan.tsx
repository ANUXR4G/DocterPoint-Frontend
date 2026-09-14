"use client"

import React, { useRef, useState } from "react"
import { Icon } from "@/components"
import { cookies } from "@/utils/cookies"
import { prepareIdScanImage } from "@/lib/prepareIdScanImage"
import DocumentScanPreview from "@/components/inputs/DocumentScanPreview"
import { userService, type IdScanResult } from "@/lib/services/user"
import { TInfoOptions } from "@/types"

type Props = {
  setValues: React.Dispatch<React.SetStateAction<TInfoOptions>>
  enableModalMode?: boolean
  accessToken?: string
  guestMode?: boolean
}

function applyScanToForm(
  setValues: React.Dispatch<React.SetStateAction<TInfoOptions>>,
  data: IdScanResult,
) {
  setValues((prev) => {
    const next = { ...prev }
    if (data.name) next.name = data.name
    if (data.gender) next.gender = data.gender
    if (data.address) next.address = data.address
    if (data.contactNumber) next.contactNumber = data.contactNumber
    if (data.dateOfBirth) {
      const d = new Date(`${data.dateOfBirth}T00:00:00`)
      if (!Number.isNaN(d.getTime())) next.dateOfBirth = d
    }
    return next
  })
}

export default function IdDocumentScan({
  setValues,
  enableModalMode = false,
  accessToken,
  guestMode = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
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
      setError("Please upload a JPG, PNG, or WEBP photo of your ID.")
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("Image must be under 6 MB.")
      return
    }

    setPreview(URL.createObjectURL(file))
    setIsLoading(true)

    try {
      const { base64, mimeType } = await prepareIdScanImage(file)
      const res = guestMode
        ? await userService.scanIdDocumentGuest({ imageBase64: base64, mimeType })
        : await userService.scanIdDocument(
            accessToken ||
              cookies.getCookie("access_token") ||
              cookies.getCookie("refresh_token") ||
              "",
            { imageBase64: base64, mimeType },
          )

      if (!res.data) throw new Error("No details returned from scan.")

      applyScanToForm(setValues, res.data)
      setMessage(
        `Filled from ${res.data.documentType || "ID"}. Review the fields below.`,
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
    <div
      className={`w-full min-w-0 rounded-[16px] border border-dashed border-neutral-300 bg-gradient-to-br from-neutral-50 to-white dark:border-neutral-600 dark:from-[#161616] dark:to-[#101010] sm:rounded-[20px] ${
        enableModalMode ? "mt-2 p-3" : "p-3 sm:p-4"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--theme-primary)_16%,transparent)]">
          <Icon
            name="written-page"
            className="size-5"
            pathClassName="stroke-[var(--theme-primary)]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Upload government ID
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Upload Aadhaar, PAN, passport, or other ID. We fill name, DOB, gender,
            address, and contact — review before you continue.
          </p>

          <div className="mt-3 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white transition hover:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-black sm:w-auto sm:min-h-10"
            >
              <Icon
                name="image-upload"
                className="size-4 shrink-0"
                pathClassName="stroke-current"
              />
              {isLoading ? "Reading document…" : "Upload ID photo"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              className="hidden"
              onChange={handleFile}
            />
            {fileName && !isLoading ? (
              <span className="max-w-full truncate text-center text-xs text-neutral-500 sm:max-w-[14rem] sm:text-left">
                {fileName}
              </span>
            ) : null}
          </div>

          {preview ? (
            <div className="mt-3 max-w-sm">
              <DocumentScanPreview
                src={preview}
                alt="ID preview"
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
