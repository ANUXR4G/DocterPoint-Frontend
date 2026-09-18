"use client"

import { useEffect, useState } from "react"
import { useMetaEmbeddedSignup } from "@/hooks/useMetaEmbeddedSignup"
import { proctoService } from "@/lib/services/procto"

type WhatsAppSetup = {
  metaConfigured: boolean
  webhookPath: string
  waMeLink: string | null
  canConnect: boolean
  embeddedSignupEnabled?: boolean
  autoResolveEnabled?: boolean
  metaAppId?: string | null
  metaConfigId?: string | null
  metaApiVersion?: string
  coexistenceFlow?: boolean
}

type Props = {
  practiceId: string
  canManage: boolean
  whatsappNumber?: {
    phoneNumber: string
    status: string
    wabaId?: string | null
    wabaPhoneNumberId?: string | null
    templatesStatus?: string | null
    displayNameStatus?: string | null
    activatedAt?: string | null
    provider?: string
  } | null
  whatsappBusinessNumber?: string | null
  /** Settings / profile Tel — prefilled into Add phone when connecting. */
  clinicPhone?: string | null
  whatsappSetup?: WhatsAppSetup | null
  hasWhatsAppEntitlement: boolean
  subscriptionUsable: boolean
  onConnected: () => void
}

function formatPhoneDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(-10)
  if (d.length !== 10) return digits
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`
}

export default function PracticeWhatsAppConnect({
  practiceId,
  canManage,
  whatsappNumber,
  whatsappBusinessNumber,
  clinicPhone,
  whatsappSetup,
  hasWhatsAppEntitlement,
  subscriptionUsable,
  onConnected,
}: Props) {
  const [phone, setPhone] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [busy, setBusy] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [otpBusy, setOtpBusy] = useState(false)
  const [provision, setProvision] = useState<{
    templatesApproved?: number
    templatesTotal?: number
    templatesStatus?: string
    proactiveAlertsReady?: boolean
    needsOtp?: boolean
    wabaId?: string | null
  } | null>(null)
  const { launchEmbeddedSignup } = useMetaEmbeddedSignup()

  const metaConfigured = whatsappSetup?.metaConfigured ?? false
  const embeddedSignupEnabled = Boolean(whatsappSetup?.embeddedSignupEnabled)
  const autoResolveEnabled = Boolean(whatsappSetup?.autoResolveEnabled)
  const isLive = whatsappNumber?.status === "LIVE"
  const needsOtp =
    whatsappNumber?.status === "VERIFYING" || Boolean(provision?.needsOtp)
  const isConnected = Boolean(
    whatsappNumber &&
      ["LIVE", "TEMPLATES_PENDING", "DISPLAY_NAME_PENDING", "VERIFYING"].includes(
        whatsappNumber.status,
      ),
  )
  const waMeLink = whatsappSetup?.waMeLink

  async function loadProvisionStatus() {
    const res = await proctoService.getPracticeWhatsAppStatus(practiceId)
    if (res?.status === "successful" && res.data) {
      setProvision(res.data as typeof provision)
    }
  }

  useEffect(() => {
    if (isConnected) void loadProvisionStatus()
  }, [isConnected, practiceId, whatsappNumber?.status])

  useEffect(() => {
    const seed =
      whatsappNumber?.phoneNumber ??
      whatsappBusinessNumber?.replace(/\D/g, "").slice(-10) ??
      clinicPhone?.replace(/\D/g, "").slice(-10) ??
      ""
    if (seed && !phone) setPhone(seed)
  }, [whatsappNumber?.phoneNumber, whatsappBusinessNumber, clinicPhone, phone])

  async function resolveFromMeta() {
    if (!phone.trim() || !autoResolveEnabled) return
    setResolving(true)
    setError("")
    const res = await proctoService.resolvePracticeWhatsApp(
      practiceId,
      phone.trim(),
    )
    setResolving(false)
    if (res?.status === "successful" && res.data) {
      const data = res.data as { phoneNumberId: string }
      setWabaId(data.phoneNumberId)
      setSuccess("Meta Phone Number ID fetched automatically.")
      return
    }
    setError(res?.message || "Could not find this number on Meta.")
  }

  async function connectWithPayload(payload: {
    phoneNumber: string
    wabaPhoneNumberId?: string
    wabaId?: string
    oauthCode?: string
  }) {
    if (!canManage) {
      setError("Only clinic owners/admins can connect WhatsApp.")
      return
    }
    setBusy(true)
    setError("")
    setSuccess("")
    const res = await proctoService.connectPracticeWhatsApp(practiceId, payload)
    setBusy(false)
    if (res?.status === "successful" || res?.status === "created") {
      const data = res.data as {
        goLive?: { link?: string; message?: string }
        provision?: {
          templatesSubmitted?: number
          templatesSkipped?: number
          templatesStatus?: string
          errors?: string[]
        }
      }
      const provisionNote = data?.provision
        ? data.provision.templatesSubmitted
          ? ` Submitted ${data.provision.templatesSubmitted} UTILITY templates — line is LIVE.`
          : data.provision.templatesSkipped
            ? " Templates already on this WABA — line is LIVE."
            : " Line is LIVE."
        : ""
      setSuccess(
        (data?.goLive?.message ??
          "WhatsApp line connected. Patients can message your clinic number — the booking bot will reply.") +
          provisionNote,
      )
      onConnected()
      return
    }
    setError(res?.message || "Could not connect WhatsApp line.")
  }

  async function connectManual(e: React.FormEvent) {
    e.preventDefault()
    await connectWithPayload({
      phoneNumber: phone.trim(),
      ...(wabaId.trim() ? { wabaPhoneNumberId: wabaId.trim() } : {}),
    })
  }

  async function connectWithMeta() {
    if (
      !whatsappSetup?.metaAppId ||
      !whatsappSetup?.metaConfigId ||
      !whatsappSetup?.metaApiVersion
    ) {
      setError("Meta Embedded Signup is not configured on the server.")
      return
    }
    if (!phone.trim()) {
      setError("Enter your clinic WhatsApp number first, then Connect with Meta.")
      return
    }
    setBusy(true)
    setError("")
    setSuccess("")
    try {
      const result = await launchEmbeddedSignup({
        appId: whatsappSetup.metaAppId,
        configId: whatsappSetup.metaConfigId,
        apiVersion: whatsappSetup.metaApiVersion,
        coexistenceFlow: whatsappSetup.coexistenceFlow,
      })
      if (result.phoneNumberId) setWabaId(result.phoneNumberId)
      await connectWithPayload({
        phoneNumber: phone.trim(),
        wabaPhoneNumberId: result.phoneNumberId,
        wabaId: result.wabaId,
        oauthCode: result.oauthCode,
      })
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : "Meta connect failed.")
    }
  }

  async function requestOtp(method: "SMS" | "VOICE" = "SMS") {
    if (!canManage) {
      setError("Only clinic owners/admins can verify WhatsApp.")
      return
    }
    setOtpBusy(true)
    setError("")
    setSuccess("")
    const res = await proctoService.requestWhatsAppVerifyOtp(practiceId, {
      method,
    })
    setOtpBusy(false)
    if (res?.status === "successful" || res?.status === "created") {
      setSuccess(
        (res.data as { message?: string })?.message ||
          `Verification code sent via ${method}.`,
      )
      return
    }
    setError(res?.message || "Could not send verification code.")
  }

  async function confirmOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!canManage) {
      setError("Only clinic owners/admins can verify WhatsApp.")
      return
    }
    const code = otpCode.replace(/\D/g, "")
    if (code.length < 4) {
      setError("Enter the verification code from SMS or voice call.")
      return
    }
    setOtpBusy(true)
    setError("")
    setSuccess("")
    const res = await proctoService.confirmWhatsAppVerifyOtp(practiceId, code)
    setOtpBusy(false)
    if (res?.status === "successful" || res?.status === "created") {
      setSuccess(
        (res.data as { message?: string })?.message ||
          "WhatsApp line is LIVE.",
      )
      setOtpCode("")
      onConnected()
      void loadProvisionStatus()
      return
    }
    setError(res?.message || "Invalid or expired code. Try again.")
  }

  async function copyLink() {
    if (!waMeLink) return
    try {
      await navigator.clipboard.writeText(waMeLink)
      setSuccess("Patient link copied to clipboard.")
    } catch {
      setError("Could not copy link — select and copy manually.")
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900/40 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            WhatsApp booking line
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Your clinic number + Meta API — the booking bot replies to patients
            automatically. That number also becomes your Settings Tel (public
            clinic phone). No manual Phone Number ID copy when Meta is configured.
          </p>
        </div>
        {isLive ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            Live
          </span>
        ) : isConnected ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {needsOtp ? "Verify OTP" : "Provisioning"}
          </span>
        ) : null}
      </div>

      {!subscriptionUsable ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Subscribe to Starter or above to unlock the WhatsApp booking line.
        </p>
      ) : !hasWhatsAppEntitlement ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Your current plan does not include a WhatsApp line. Upgrade under the
          plans below.
        </p>
      ) : isConnected && whatsappNumber ? (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Clinic WhatsApp
              </dt>
              <dd className="mt-1 font-semibold tabular-nums text-neutral-900 dark:text-white">
                {formatPhoneDisplay(whatsappNumber.phoneNumber)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Meta Phone Number ID
              </dt>
              <dd className="mt-1 font-mono text-sm text-neutral-900 dark:text-white">
                {whatsappNumber.wabaPhoneNumberId ?? "— (local mock)"}
              </dd>
            </div>
            {(whatsappNumber.wabaId || provision?.wabaId) ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Meta WABA ID
                </dt>
                <dd className="mt-1 font-mono text-xs text-neutral-700 dark:text-neutral-300">
                  {whatsappNumber.wabaId ?? provision?.wabaId}
                </dd>
              </div>
            ) : null}
          </dl>

          {needsOtp ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Verify this number with Meta OTP
              </p>
              <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
                We added {formatPhoneDisplay(whatsappNumber.phoneNumber)} to
                your Meta account. Enter the SMS (or voice) code to make the
                booking bot LIVE — no WhatsApp Manager needed.
              </p>
              <form
                onSubmit={(e) => void confirmOtp(e)}
                className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
              >
                <label className="block flex-1 text-sm">
                  <span className="font-medium text-amber-950 dark:text-amber-100">
                    Verification code
                  </span>
                  <input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    className="form-input mt-1 min-h-11 w-full rounded-lg px-3 py-2 text-sm"
                    disabled={!canManage || otpBusy}
                  />
                </label>
                <button
                  type="submit"
                  disabled={!canManage || otpBusy}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-amber-600"
                >
                  {otpBusy ? "Verifying…" : "Confirm & go LIVE"}
                </button>
              </form>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  disabled={!canManage || otpBusy}
                  onClick={() => void requestOtp("SMS")}
                  className="font-semibold text-amber-900 underline disabled:opacity-50 dark:text-amber-100"
                >
                  Resend SMS
                </button>
                <button
                  type="button"
                  disabled={!canManage || otpBusy}
                  onClick={() => void requestOtp("VOICE")}
                  className="font-semibold text-amber-900 underline disabled:opacity-50 dark:text-amber-100"
                >
                  Call me instead
                </button>
              </div>
            </div>
          ) : null}

          {provision?.proactiveAlertsReady && isLive ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
              <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                Templates approved · proactive alerts ready
              </p>
              <p className="mt-1 text-xs text-emerald-900/90 dark:text-emerald-200/90">
                Reminders and confirmations can send on this line. UTILITY
                templates are auto-approved in GlucoGuide after connect.
              </p>
            </div>
          ) : null}

          {!isLive && isConnected ? (
            <p className="text-xs text-neutral-500">
              Status: {whatsappNumber.status.replace(/_/g, " ").toLowerCase()}
              {whatsappNumber.templatesStatus
                ? ` · templates: ${whatsappNumber.templatesStatus}`
                : ""}
            </p>
          ) : null}

          {waMeLink ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Share with patients
              </p>
              <p className="mt-1 break-all font-mono text-xs text-emerald-800 dark:text-emerald-200">
                {waMeLink}
              </p>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="mt-2 text-sm font-semibold text-emerald-800 underline dark:text-emerald-200"
              >
                Copy wa.me link
              </button>
            </div>
          ) : null}
        </div>
      ) : whatsappSetup?.canConnect ? (
        <div className="mt-4 space-y-4">
          {embeddedSignupEnabled ? (
            <div className="rounded-xl border border-[#1877F2]/30 bg-[#1877F2]/5 px-4 py-3">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                Connect with Meta (Embedded Signup)
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-neutral-600 dark:text-neutral-400">
                <li>Enter your clinic WhatsApp Business number</li>
                <li>Tap Connect with Meta and complete Facebook login</li>
                <li>
                  We save your WABA + Phone Number ID and submit booking templates
                </li>
                <li>
                  Patients message this number — the booking bot replies
                  automatically (also saved as Settings Tel)
                </li>
              </ol>
              <label className="mt-3 block text-sm">
                <span className="font-medium">Clinic WhatsApp number</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  className="form-input mt-1 min-h-11 w-full rounded-lg px-3 py-2 text-sm"
                  disabled={!canManage || busy}
                />
              </label>
              <button
                type="button"
                disabled={!canManage || busy}
                onClick={() => void connectWithMeta()}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#1877F2] px-4 text-sm font-semibold text-white transition hover:bg-[#166fe5] disabled:opacity-50"
              >
                {busy ? "Connecting via Meta…" : "Connect with Meta"}
              </button>
            </div>
          ) : null}

          <form onSubmit={(e) => void connectManual(e)} className="space-y-3">
            <label className="block text-sm">
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                Clinic WhatsApp number
              </span>
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  setWabaId("")
                }}
                onBlur={() => void resolveFromMeta()}
                placeholder="10-digit mobile registered on Meta"
                className="form-input mt-1 min-h-11 w-full rounded-lg px-3 py-2 text-sm"
                required
                disabled={!canManage || busy}
              />
            </label>

            {wabaId ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                Meta Phone Number ID:{" "}
                <span className="font-mono font-semibold">{wabaId}</span>
                {resolving ? " (looking up…)" : " (auto)"}
              </p>
            ) : autoResolveEnabled ? (
              <button
                type="button"
                disabled={!canManage || busy || resolving || !phone.trim()}
                onClick={() => void resolveFromMeta()}
                className="text-sm font-semibold text-[#0099ff] underline disabled:opacity-50"
              >
                {resolving ? "Fetching from Meta…" : "Fetch Phone Number ID from Meta"}
              </button>
            ) : !embeddedSignupEnabled ? (
              <p className="text-xs text-neutral-500">
                Set{" "}
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
                  META_APP_ID
                </code>{" "}
                +{" "}
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
                  META_EMBEDDED_SIGNUP_CONFIG_ID
                </code>{" "}
                or{" "}
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
                  WHATSAPP_WABA_ID
                </code>{" "}
                on the server for automatic ID lookup.
              </p>
            ) : null}

            {!embeddedSignupEnabled ? (
              <button
                type="submit"
                disabled={!canManage || busy}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-white transition hover:bg-[#1fb855] disabled:opacity-50"
              >
                {busy ? "Connecting…" : "Connect & activate bot"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canManage || busy || (metaConfigured && !wabaId)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-100"
              >
                {busy ? "Connecting…" : "Connect manually (number already on Meta)"}
              </button>
            )}
          </form>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">
          WhatsApp line is already configured for this clinic.
        </p>
      )}

      {success ? (
        <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  )
}
