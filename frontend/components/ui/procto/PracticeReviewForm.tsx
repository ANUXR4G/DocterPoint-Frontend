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

export default function PracticeReviewForm({
  practiceId,
  bookingId,
  defaultAuthorName = "",
  onSubmitted,
}: Props) {
  const [authorName, setAuthorName] = useState(defaultAuthorName)
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
      rating: 5,
      providerRating: 5,
      body: body || undefined,
    })
    setBusy(false)
    if (res.status === "successful") {
      setBody("")
      setMsg("Thanks for your review. It will appear on the clinic profile.")
      onSubmitted?.()
    } else {
      setMsg(res.message ?? "Could not submit review.")
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        Your review
      </p>
      <input
        className="form-input w-full rounded-lg px-3 py-2 text-sm"
        placeholder="Your name (optional)"
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
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
