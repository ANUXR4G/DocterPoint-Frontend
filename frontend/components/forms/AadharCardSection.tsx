"use client"

import React, { useEffect, useRef, useState } from "react"
import { Icon } from "@/components"
import { cookies } from "@/utils/cookies"
import {
  formatAadhaarDisplay,
  parseAadhaarInput,
  panValidationMessage,
  parsePanInput,
} from "@/lib/indianIdInput"
import { prepareIdScanImage } from "@/lib/prepareIdScanImage"
import DocumentScanPreview from "@/components/inputs/DocumentScanPreview"
import { userService, type IdScanResult } from "@/lib/services/user"
import { TInfoOptions } from "@/types"

const MAX_IMAGES = 5

type UploadedImage = {
  id: string
  fileName: string
  previewUrl: string
  base64: string
  mimeType: string
  documentType?: string | null
  scanError?: string
}

export type IdentityDocumentsPayload = {
  idImages: Array<{ base64: string; mimeType: string; documentType?: string | null }>
  profilePhoto: { base64: string; mimeType: string } | null
}

type Props = {
  setValues: React.Dispatch<React.SetStateAction<TInfoOptions>>
  aadharNumber: string
  panNumber: string
  onAadharNumberChange: (value: string) => void
  onPanNumberChange: (value: string) => void
  onDocumentsChange?: (payload: IdentityDocumentsPayload) => void
  accessToken?: string
  guestMode?: boolean
  compact?: boolean
}

function applyScanToForm(
  setValues: React.Dispatch<React.SetStateAction<TInfoOptions>>,
  data: IdScanResult,
  onAadharNumberChange: (value: string) => void,
  onPanNumberChange: (value: string) => void,
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
  if (data.aadharNumber) onAadharNumberChange(data.aadharNumber)
  if (data.panNumber) onPanNumberChange(data.panNumber)
}

function pickProfilePhotoId(items: UploadedImage[]): string | null {
  if (items.length === 0) return null
  return items.find((item) => item.documentType === "AADHAAR")?.id ?? items[0]!.id
}

export default function AadharCardSection({
  setValues,
  aadharNumber,
  panNumber,
  onAadharNumberChange,
  onPanNumberChange,
  onDocumentsChange,
  accessToken,
  guestMode = false,
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<UploadedImage[]>([])
  const [profilePhotoId, setProfilePhotoId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [scanningPreview, setScanningPreview] = useState<{
    src: string
    fileName: string
  } | null>(null)

  useEffect(() => {
    if (!onDocumentsChange) return

    const idImages = images.map(({ base64, mimeType, documentType }) => ({
      base64,
      mimeType,
      documentType,
    }))

    let profilePhoto: { base64: string; mimeType: string } | null = null
    if (profilePhotoId) {
      const selected = images.find((img) => img.id === profilePhotoId)
      if (selected) {
        profilePhoto = { base64: selected.base64, mimeType: selected.mimeType }
      }
    }

    onDocumentsChange({ idImages, profilePhoto })
  }, [images, profilePhotoId, onDocumentsChange])

  async function scanOne(
    base64: string,
    mimeType: string,
  ): Promise<IdScanResult> {
    if (guestMode) {
      const res = await userService.scanIdDocumentGuest({ imageBase64: base64, mimeType })
      if (!res.data) throw new Error("No details returned from scan.")
      return res.data
    }

    const token =
      accessToken ||
      cookies.getCookie("access_token") ||
      cookies.getCookie("refresh_token")
    if (!token) throw new Error("Sign in first, then upload ID documents.")

    const res = await userService.scanIdDocument(token, { imageBase64: base64, mimeType })
    if (!res.data) throw new Error("No details returned from scan.")
    return res.data
  }

  async function handleIdFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (files.length === 0) return

    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) {
      setError(`You can upload up to ${MAX_IMAGES} ID images.`)
      return
    }

    setError(null)
    setMessage(null)
    setIsLoading(true)

    const added: UploadedImage[] = []
    let scannedCount = 0

    try {
      for (const file of files.slice(0, remaining)) {
        if (!file.type.startsWith("image/")) {
          setError("Each file must be JPG, PNG, or WEBP.")
          continue
        }
        if (file.size > 6 * 1024 * 1024) {
          setError("Each image must be under 6 MB.")
          continue
        }

        setLoadingLabel(`Reading ${file.name}…`)
        const previewUrl = URL.createObjectURL(file)
        setScanningPreview({ src: previewUrl, fileName: file.name })

        const { base64, mimeType } = await prepareIdScanImage(file)
        const item: UploadedImage = {
          id: crypto.randomUUID(),
          fileName: file.name,
          previewUrl,
          base64,
          mimeType,
        }

        try {
          const data = await scanOne(base64, mimeType)
          item.documentType = data.documentType
          applyScanToForm(setValues, data, onAadharNumberChange, onPanNumberChange)
          scannedCount += 1
        } catch (scanErr) {
          item.scanError =
            scanErr instanceof Error ? scanErr.message : "Could not read this image."
        }

        added.push(item)
      }

      if (added.length === 0) return

      setImages((prev) => {
        const next = [...prev, ...added].slice(0, MAX_IMAGES)
        setProfilePhotoId((current) => {
          const aadhaar = next.find((img) => img.documentType === "AADHAAR")
          if (aadhaar) return aadhaar.id
          if (current && next.some((img) => img.id === current)) return current
          return pickProfilePhotoId(next)
        })
        return next
      })

      if (scannedCount > 0) {
        setMessage(
          scannedCount === 1
            ? "ID read — review your details and ID numbers below."
            : `Read ${scannedCount} documents — review your details below.`,
        )
      } else {
        setMessage("Images saved. Enter details manually if the scan did not fill them.")
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read the documents.",
      )
    } finally {
      setIsLoading(false)
      setLoadingLabel(null)
      setScanningPreview(null)
    }
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const next = prev.filter((img) => img.id !== id)
      setProfilePhotoId((current) =>
        current === id ? pickProfilePhotoId(next) : current,
      )
      return next
    })
  }

  const panError = panValidationMessage(panNumber)

  return (
    <div className="min-w-0 space-y-3">
      <div
        className={`w-full min-w-0 rounded-[16px] border border-dashed border-neutral-300 bg-gradient-to-br from-neutral-50 to-white dark:border-neutral-600 dark:from-[#161616] dark:to-[#101010] sm:rounded-[20px] ${
          compact ? "p-3" : "p-3 sm:p-4"
        }`}
      >
        <div className={`flex gap-3 ${compact ? "flex-col" : "flex-col sm:flex-row sm:items-start"}`}>
          <div
            className={`flex shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--theme-primary)_16%,transparent)] ${
              compact ? "size-9" : "size-10"
            }`}
          >
            <Icon
              name="written-page"
              className="size-5"
              pathClassName="stroke-[var(--theme-primary)]"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`font-semibold text-neutral-900 dark:text-neutral-100 ${compact ? "text-xs" : "text-sm"}`}>
              Upload ID documents (optional)
            </p>
            <p className={`mt-0.5 leading-relaxed text-neutral-500 dark:text-neutral-400 ${compact ? "text-[10px]" : "text-xs"}`}>
              Add up to {MAX_IMAGES} photos. We read each image, fill your details, and
              use your Aadhaar photo (or first upload) as your dashboard profile picture.
            </p>

            <div className="mt-3 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                disabled={isLoading || images.length >= MAX_IMAGES}
                onClick={() => inputRef.current?.click()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-4 text-xs font-semibold text-white transition hover:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-black sm:w-auto sm:min-h-10"
              >
                <Icon
                  name="image-upload"
                  className="size-4 shrink-0"
                  pathClassName="stroke-current"
                />
                {isLoading
                  ? loadingLabel || "Reading document…"
                  : images.length >= MAX_IMAGES
                    ? "Maximum images added"
                    : "Add ID images"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                multiple
                className="hidden"
                onChange={handleIdFiles}
              />
            </div>

            {scanningPreview ? (
              <div className="mt-3 max-w-sm">
                <DocumentScanPreview
                  src={scanningPreview.src}
                  alt={scanningPreview.fileName}
                  fileName={scanningPreview.fileName}
                  scanning
                />
              </div>
            ) : null}

            {images.length > 0 ? (
              <div
                className={`mt-3 grid gap-3 ${
                  compact ? "grid-cols-1" : "grid-cols-1 min-[420px]:grid-cols-2"
                }`}
              >
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="relative rounded-xl border border-neutral-200 p-2 dark:border-neutral-700"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.previewUrl}
                      alt={img.fileName}
                      className={`w-full rounded-lg object-contain ${compact ? "max-h-24" : "max-h-32"}`}
                    />
                    <p className="mt-1 truncate text-[11px] text-neutral-500">
                      {img.fileName}
                      {img.documentType ? ` · ${img.documentType}` : ""}
                      {profilePhotoId === img.id ? " · Profile photo" : ""}
                    </p>
                    {img.scanError ? (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        {img.scanError}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white"
                    >
                      Remove
                    </button>
                  </div>
                ))}
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

      <div
        className={`grid grid-cols-1 gap-3 ${compact ? "" : "min-[480px]:grid-cols-2"}`}
      >
        <div className="min-w-0">
          <label
            htmlFor="aadharNumber"
            className="mb-1.5 block text-sm font-semibold text-neutral-800 dark:text-neutral-100"
          >
            Aadhaar number (optional)
          </label>
          <div
            className={`form-input-shell flex min-h-14 w-full min-w-0 items-center gap-3 px-4 ${
              aadharNumber.length > 0 && aadharNumber.length !== 12
                ? "outline outline-1 border-red-600 outline-red-600"
                : ""
            }`}
          >
            <Icon name="written-page" className="size-5 shrink-0 opacity-90" />
            <input
              id="aadharNumber"
              name="aadharNumber"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              placeholder="1234 5678 9012"
              value={formatAadhaarDisplay(aadharNumber)}
              onChange={(e) =>
                onAadharNumberChange(parseAadhaarInput(e.target.value))
              }
              className="form-input min-w-0 flex-1 border-none bg-transparent py-3 text-base font-semibold outline-none placeholder:font-normal placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
          </div>
          {aadharNumber.length > 0 && aadharNumber.length !== 12 ? (
            <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
              Aadhaar must be exactly 12 digits.
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              12 digits — spaces are added automatically.
            </p>
          )}
        </div>
        <div className="min-w-0">
          <label
            htmlFor="panNumber"
            className="mb-1.5 block text-sm font-semibold text-neutral-800 dark:text-neutral-100"
          >
            PAN (optional)
          </label>
          <div
            className={`form-input-shell flex min-h-14 w-full min-w-0 items-center gap-3 px-4 ${
              panError ? "outline outline-1 border-red-600 outline-red-600" : ""
            }`}
          >
            <Icon name="written-page" className="size-5 shrink-0 opacity-90" />
            <input
              id="panNumber"
              name="panNumber"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={10}
              placeholder="ABCDE1234F"
              value={panNumber}
              onChange={(e) => onPanNumberChange(parsePanInput(e.target.value))}
              className="form-input min-w-0 flex-1 border-none bg-transparent py-3 text-base font-semibold uppercase outline-none placeholder:font-normal placeholder:normal-case placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
          </div>
          {panError ? (
            <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
              {panError}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              10 characters — e.g. ABCDE1234F
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
