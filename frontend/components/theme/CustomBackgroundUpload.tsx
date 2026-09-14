"use client"

import { useEffect, useRef, useState } from "react"
import { ImagePlus, Trash2, X } from "lucide-react"
import { isCustomImageBg } from "@/lib/themeBg"

type Props = {
  scopeLabel: string
  activeBg: string | null
  busy?: boolean
  onRemove: () => void | Promise<void>
  onConfirmUpload: (file: File) => Promise<void>
}

export default function CustomBackgroundUpload({
  scopeLabel,
  activeBg,
  busy = false,
  onRemove,
  onConfirmUpload,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function clearPending() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setImgFile(null)
    setError("")
    if (fileRef.current) fileRef.current.value = ""
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    clearPending()
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, or WEBP image.")
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must be under 8 MB.")
      return
    }

    setImgFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function onConfirm() {
    if (!imgFile) return
    setError("")
    try {
      await onConfirmUpload(imgFile)
      clearPending()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save background.")
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-dashed border-neutral-300 p-4 dark:border-neutral-600">
      <p className="text-base font-bold">Custom image</p>
      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">
        Upload a photo for {scopeLabel}. Preview first, then confirm to apply it
        as your dashboard background.
      </p>

      {isCustomImageBg(activeBg) && !previewUrl ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div
            className="h-20 w-36 rounded-lg bg-cover bg-center ring-1 ring-neutral-200 dark:ring-neutral-700"
            style={{ backgroundImage: `url(${activeBg})` }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRemove()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-bold dark:border-neutral-600"
          >
            <Trash2 className="size-3.5" />
            Remove custom
          </button>
        </div>
      ) : null}

      {previewUrl ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-bold text-neutral-900 dark:text-white">
            Preview — how it will look behind your dashboard
          </p>
          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Background preview"
              className="h-40 w-full object-cover object-center sm:h-48"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/75 to-white/85 dark:from-[#090909]/70 dark:via-[#090909]/75 dark:to-[#090909]/85" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                {imgFile?.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !imgFile}
              onClick={() => void onConfirm()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-black"
            >
              <ImagePlus className="size-3.5" />
              {busy ? "Saving…" : "Confirm background"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={clearPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-bold dark:border-neutral-600"
            >
              <X className="size-3.5" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-bold transition hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            <ImagePlus className="size-4" />
            Choose image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jpg"
            className="hidden"
            onChange={onFilePick}
          />
        </div>
      )}

      {error ? (
        <p className="mt-3 text-sm font-bold text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
