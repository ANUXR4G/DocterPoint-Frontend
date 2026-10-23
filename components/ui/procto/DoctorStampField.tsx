"use client"

import { useRef, useState } from "react"
import { useCloudinary } from "@/hooks/useCloudinary"
import { resolveUploadUrl } from "@/lib/uploads"
import { proctoService } from "@/lib/services/procto"

type Props = {
  practiceId: string
  memberUserId: string
  doctorName: string
  currentStamp?: string | null
  canManage: boolean
  onSaved: () => Promise<void> | void
  /** Compact row for dense lists (clinic doctors overview). */
  compact?: boolean
}

/** Upload / change / remove a doctor's personal stamp for Rx & consultation prints. */
export default function DoctorStampField({
  practiceId,
  memberUserId,
  doctorName,
  currentStamp,
  canManage,
  onSaved,
  compact = false,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const { handleImgUpload, isUploading } = useCloudinary(null)

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setError("")
    if (!file.type.startsWith("image/")) {
      setError("Choose an image (PNG or JPG).")
      return
    }
    setBusy(true)
    try {
      const json = await handleImgUpload(file)
      const url = json?.secure_url
      if (!url) {
        setError("Upload failed. Try again.")
        setBusy(false)
        return
      }
      const res = await proctoService.updateRoleAccess(practiceId, memberUserId, {
        stampSrc: url,
      })
      if (res.status !== "successful") {
        setError(res.message || "Could not save doctor stamp.")
        setBusy(false)
        return
      }
      await onSaved()
    } catch {
      setError("Failed to upload stamp image.")
    } finally {
      setBusy(false)
    }
  }

  async function removeStamp() {
    setError("")
    setBusy(true)
    const res = await proctoService.updateRoleAccess(practiceId, memberUserId, {
      stampSrc: null,
    })
    setBusy(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not remove doctor stamp.")
      return
    }
    await onSaved()
  }

  return (
    <div
      className={
        compact
          ? "mt-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2 dark:border-neutral-700/80 dark:bg-neutral-800/60"
          : "mt-2.5 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 dark:border-neutral-700/80 dark:bg-neutral-800/60"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {currentStamp ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveUploadUrl(currentStamp)}
              alt={`${doctorName} stamp`}
              className="size-9 rounded-md border border-neutral-300 bg-white object-contain dark:border-neutral-600"
            />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white text-[10px] font-medium text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800">
              No stamp
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-800 dark:text-neutral-200">
              Doctor&apos;s stamp
            </p>
            <p className="text-[11px] text-slate-500 dark:text-neutral-400">
              {currentStamp
                ? "Printed on this doctor’s prescriptions & visit reports"
                : "Optional — printed next to the clinic stamp on Rx / consultation"}
            </p>
          </div>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={busy || isUploading}
              onClick={() => fileRef.current?.click()}
              className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {busy || isUploading
                ? "Saving…"
                : currentStamp
                  ? "Change stamp"
                  : "Upload stamp"}
            </button>
            {currentStamp ? (
              <button
                type="button"
                disabled={busy || isUploading}
                onClick={() => void removeStamp()}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200"
              >
                Remove
              </button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={(e) => void onFileSelected(e)}
            />
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
