"use client"

import { useEffect, useRef, useState } from "react"
import { useCloudinary } from "@/hooks/useCloudinary"
import { resolveUploadUrl } from "@/lib/uploads"

const MAX_BYTES = 5 * 1024 * 1024

type SaveResult = { ok: boolean; message?: string }

type Props = {
  label: string
  hint?: string
  src?: string | null
  name?: string | null
  shape?: "circle" | "square"
  onSave: (url: string | null) => Promise<SaveResult>
}

/** Upload / change / remove a photo or logo — saves as soon as it uploads. */
export default function ProfilePhotoField({
  label,
  hint,
  src,
  name,
  shape = "circle",
  onSave,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [current, setCurrent] = useState(src ?? null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const { handleImgUpload, isUploading } = useCloudinary(null)

  useEffect(() => {
    setCurrent(src ?? null)
  }, [src])

  const busy = saving || isUploading
  const preview = resolveUploadUrl(current)
  const initial =
    (name || label).replace(/^Dr\.?\s*/i, "").trim().charAt(0).toUpperCase() || "?"
  const radius = shape === "circle" ? "rounded-full" : "rounded-2xl"

  async function persist(url: string | null, done: string) {
    setSaving(true)
    const res = await onSave(url).catch(() => ({
      ok: false,
      message: "Could not save. Check your connection and try again.",
    }))
    setSaving(false)
    if (!res.ok) {
      setError(res.message || "Could not save the photo.")
      return
    }
    setCurrent(url)
    setMessage(done)
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setError("")
    setMessage("")
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPG or PNG).")
      return
    }
    if (file.size > MAX_BYTES) {
      setError("Image is larger than 5 MB. Choose a smaller one.")
      return
    }
    let url: string | undefined
    try {
      const json = await handleImgUpload(file)
      url = json?.secure_url
    } catch {
      url = undefined
    }
    if (!url) {
      setError("Upload failed. Try again.")
      return
    }
    await persist(url, `${label} updated.`)
  }

  async function remove() {
    setError("")
    setMessage("")
    await persist(null, `${label} removed.`)
  }

  return (
    <div className="flex items-center gap-4">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={label}
          className={`size-20 shrink-0 object-cover bg-slate-200 dark:bg-slate-700 ${radius}`}
        />
      ) : (
        <span
          className={`inline-flex size-20 shrink-0 items-center justify-center bg-gradient-to-br from-blue-500 to-cyan-500 text-2xl font-bold text-white ${radius}`}
          aria-hidden
        >
          {initial}
        </span>
      )}
      <div className="min-w-0 space-y-1.5">
        <p className="text-base font-semibold">{label}</p>
        {hint ? <p className="text-sm opacity-70">{hint}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-9 items-center rounded-lg bg-[var(--theme-primary)] px-3.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isUploading ? "Uploading…" : saving ? "Saving…" : preview ? "Change" : "Upload"}
          </button>
          {preview ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="inline-flex h-9 items-center rounded-lg border border-neutral-300 px-3.5 text-sm font-semibold disabled:opacity-60 dark:border-neutral-600"
            >
              Remove
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        ) : message ? (
          <p className="text-sm font-medium text-emerald-600">{message}</p>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void onPick(e)}
      />
    </div>
  )
}
