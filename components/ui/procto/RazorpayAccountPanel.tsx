"use client"

import { useEffect, useState } from "react"
import { Button, IconInput } from "@/components"
import { proctoService, type RazorpaySettings } from "@/lib/services/procto"

const sectionLabel =
  "mb-3 text-sm font-bold uppercase tracking-[0.12em] text-blue-600 dark:text-sky-400"

export default function RazorpayAccountPanel({ practiceId }: { practiceId: string }) {
  const [settings, setSettings] = useState<RazorpaySettings | null>(null)
  const [loadError, setLoadError] = useState("")
  const [keyId, setKeyId] = useState("")
  const [keySecret, setKeySecret] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    void proctoService.getRazorpaySettings(practiceId).then((res) => {
      if (!alive) return
      if (res.status === "successful" && res.data) {
        setSettings(res.data)
        setKeyId(res.data.keyId ?? "")
      } else {
        setLoadError(res.message || "Could not load payment settings.")
      }
    })
    return () => {
      alive = false
    }
  }, [practiceId])

  if (loadError) return null
  if (!settings) {
    return (
      <div className="mt-8 border-t border-slate-200 pt-6 text-sm opacity-70 dark:border-white/10">
        Loading payment settings…
      </div>
    )
  }

  const sameKey = settings.connected && keyId.trim() === settings.keyId

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (!keyId.trim()) {
      setError("Enter your Razorpay Key ID.")
      return
    }
    if (!keySecret.trim() && !sameKey) {
      setError("Enter your Razorpay Key Secret.")
      return
    }
    setSaving(true)
    const res = await proctoService.saveRazorpaySettings(practiceId, {
      keyId: keyId.trim(),
      ...(keySecret.trim() ? { keySecret: keySecret.trim() } : {}),
      ...(webhookSecret.trim() ? { webhookSecret: webhookSecret.trim() } : {}),
    })
    setSaving(false)
    if (res.status !== "successful" || !res.data) {
      setError(res.message || "Could not save the Razorpay keys.")
      return
    }
    setSettings(res.data)
    setKeySecret("")
    setWebhookSecret("")
    setMessage(
      `Connected — patient payments now go to your Razorpay account (${res.data.mode === "LIVE" ? "Live" : "Test"} mode).`,
    )
  }

  async function remove() {
    if (
      !window.confirm(
        "Remove your Razorpay keys? New payment links will no longer go to your account, and links already sent can't be refreshed or cancelled from here.",
      )
    ) {
      return
    }
    setError("")
    setMessage("")
    setRemoving(true)
    const res = await proctoService.removeRazorpaySettings(practiceId)
    setRemoving(false)
    if (res.status !== "successful" || !res.data) {
      setError(res.message || "Could not remove the keys.")
      return
    }
    setSettings(res.data)
    setKeyId("")
    setKeySecret("")
    setWebhookSecret("")
    setMessage("Razorpay keys removed.")
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(settings!.webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — URL is selectable */
    }
  }

  const verified = settings.verifiedAt
    ? new Date(settings.verifiedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null

  return (
    <form
      onSubmit={save}
      className="mt-8 w-full border-t border-slate-200 pt-6 dark:border-white/10"
      autoComplete="off"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="dashboard-section-title text-lg">Online payments (Razorpay)</h2>
          <p className="dashboard-section-sub">
            Add your own Razorpay API keys so advance / fee payments and payment
            requests sent on WhatsApp are paid straight into your Razorpay account.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            settings.connected
              ? settings.mode === "LIVE"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
              : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
          }`}
        >
          {settings.connected
            ? `Connected · ${settings.mode === "LIVE" ? "Live" : "Test mode"}`
            : "Not connected"}
        </span>
      </div>

      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
        {settings.connected
          ? `Using key ${settings.keyId}${settings.secretLast4 ? ` · secret ••••${settings.secretLast4}` : ""}${verified ? ` · verified ${verified}` : ""}.`
          : settings.platformFallback
            ? "Until you connect, patient payments are collected on the DocterPoint Razorpay account."
            : "Online payments are off until you connect a Razorpay account."}
        {settings.mode === "TEST"
          ? " Test keys create test links — patients can't pay real money with them."
          : ""}
      </p>

      <p className={sectionLabel}>API keys</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <IconInput
          icon="written-page"
          name="razorpayKeyId"
          label="Key ID (rzp_live_… or rzp_test_…) *"
          value={keyId}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKeyId(e.target.value)}
          autoComplete="off"
          className="w-full min-w-0"
        />
        <IconInput
          icon="written-page"
          name="razorpayKeySecret"
          type="password"
          label={
            sameKey && settings.secretLast4
              ? `Key Secret (saved ••••${settings.secretLast4} — leave blank to keep)`
              : "Key Secret *"
          }
          value={keySecret}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKeySecret(e.target.value)}
          className="w-full min-w-0"
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Razorpay Dashboard → Account &amp; Settings → API Keys → Generate key. The
        secret is shown once by Razorpay; we store it encrypted and never show it again.
      </p>

      <p className={`${sectionLabel} mt-6`}>Webhook (recommended)</p>
      <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
        So payments show as <strong>Paid</strong> even if the patient closes the
        page: Razorpay Dashboard → Account &amp; Settings → Webhooks → Add new
        webhook, paste this URL, tick <code>payment_link.paid</code>,{" "}
        <code>payment_link.expired</code> and <code>payment_link.cancelled</code>,
        set a secret and enter the same secret below.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-lg bg-slate-100 px-3 py-2 text-xs dark:bg-white/10">
          {settings.webhookUrl}
        </code>
        <Button type="secondary" onClick={() => void copyWebhook()}>
          {copied ? "Copied" : "Copy URL"}
        </Button>
      </div>
      <IconInput
        icon="written-page"
        name="razorpayWebhookSecret"
        type="password"
        label={
          settings.hasWebhookSecret
            ? "Webhook secret (saved — leave blank to keep)"
            : "Webhook secret (optional)"
        }
        value={webhookSecret}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWebhookSecret(e.target.value)}
        className="w-full min-w-0"
      />

      {error ? (
        <p className="mt-4 text-base font-semibold text-red-600 dark:text-red-300">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-4 text-base font-semibold text-green-600 dark:text-green-400">
          {message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Button
          typeBtn="submit"
          disabled={saving || removing}
          className="center !py-3 !text-base !font-bold sm:min-w-[220px]"
        >
          {saving ? "Checking with Razorpay…" : "Save & verify keys"}
        </Button>
        {settings.connected ? (
          <Button
            type="outline"
            disabled={saving || removing}
            onClick={() => void remove()}
            className="center !py-3 !text-base"
          >
            {removing ? "Removing…" : "Remove keys"}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
