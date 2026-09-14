"use client"

import { useState } from "react"
import { proctoService } from "@/lib/services/procto"

type Props = {
  practiceId: string
  bookingId: string
  defaultAuthorName?: string
  providerName?: string | null
  onSubmitted?: () => void
}

function StarPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => onChange(n)}
            className={`text-2xl leading-none transition ${
              value >= n
                ? "text-amber-500"
                : "text-slate-300 hover:text-amber-300 dark:text-slate-600"
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}

export default function PracticeReviewForm({
  practiceId,
  bookingId,
  defaultAuthorName = "",
  providerName,
  onSubmitted,
}: Props) {
  const [authorName, setAuthorName] = useState(defaultAuthorName)
  const [rating, setRating] = useState(5)
  const [providerRating, setProviderRating] = useState(5)
  const [body, setBody] = useState("")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg("")
    const res = await proctoService.submitReview(practiceId, {
      bookingId,
      authorName: authorName.trim() || undefined,
      rating,
      providerRating,
      body: body || undefined,
    })
    setBusy(false)
    if (res.status === "successful") {
      setBody("")
      setRating(5)
      setProviderRating(5)
      setMsg("Thanks for your review. It will appear on the clinic profile.")
      onSubmitted?.()
    } else {
      setMsg(res.message ?? "Could not submit review.")
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        Rate your visit
      </p>
      <input
        className="form-input w-full rounded-lg px-3 py-2 text-sm"
        placeholder="Your name (optional)"
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
      />
      <StarPicker label="Clinic" value={rating} onChange={setRating} />
      <StarPicker
        label={providerName ? `Doctor · ${providerName}` : "Doctor"}
        value={providerRating}
        onChange={setProviderRating}
      />
      <textarea
        className="form-input w-full rounded-lg px-3 py-2 text-sm"
        placeholder="Share your experience (optional)"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
      />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit review"}
      </button>
      {msg ? (
        <p
          className={`text-sm ${
            msg.startsWith("Thanks")
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {msg}
        </p>
      ) : null}
    </form>
  )
}

export function StarRating({
  average,
  count,
  className = "",
}: {
  average: number | null
  count: number
  className?: string
}) {
  if (!count || average == null) return null
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-300 ${className}`}
    >
      <span aria-hidden>★</span>
      <span>{average.toFixed(1)}</span>
      <span className="font-normal text-slate-500 dark:text-slate-400">
        ({count})
      </span>
    </span>
  )
}
