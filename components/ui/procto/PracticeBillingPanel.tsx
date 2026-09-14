"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { proctoService } from "@/lib/services/procto"
import {
  openRazorpaySubscriptionCheckout,
  type RazorpayCheckoutPayload,
} from "@/lib/razorpayCheckout"
import PracticeWhatsAppConnect from "@/components/ui/procto/PracticeWhatsAppConnect"

type ClinicPlan = {
  id: string
  name: string
  priceMonthlyInr: number
  priceYearlyInr?: number | null
  maxBookingsPerMonth?: number | null
  features?: Record<string, unknown>
}

type PracticeSubscription = {
  id: string
  status: string
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  plan: ClinicPlan
  pendingPlan?: ClinicPlan | null
}

const USABLE_SUBSCRIPTION_STATUSES = new Set([
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "GRACE",
])

function isUsableSubscription(status: string) {
  return USABLE_SUBSCRIPTION_STATUSES.has(status)
}

type Entitlement = {
  usable: boolean
  planName: string | null
  maxBookingsPerMonth: number | null
  bookingsUsedThisPeriod: number
  features: Record<string, unknown>
}

type BillingPayload = {
  practice: {
    id: string
    name: string
    slug: string
    type: string
    isDirectoryListed: boolean
    isActive: boolean
    email?: string | null
    phone?: string | null
    whatsappBusinessNumber?: string | null
    whatsappNumber?: {
      phoneNumber: string
      status: string
      wabaPhoneNumberId?: string | null
      activatedAt?: string | null
      provider?: string
    } | null
  }
  subscription: PracticeSubscription | null
  plans: ClinicPlan[]
  entitlement?: Entitlement
  scheduledPlan?: ClinicPlan | null
  pendingCheckoutPlan?: ClinicPlan | null
  razorpayConfigured?: boolean
  razorpayKeyId?: string | null
  whatsappSetup?: {
    metaConfigured: boolean
    webhookPath: string
    waMeLink: string | null
    canConnect: boolean
  }
}

type CheckoutPayload = RazorpayCheckoutPayload

type Props = {
  practiceId: string
  canManage: boolean
  /** When set (e.g. from registration redirect), auto-start Razorpay checkout once. */
  autoSubscribePlanId?: string | null
  /** Hide WhatsApp connect — subscription page focuses on plans only. */
  subscriptionOnly?: boolean
}

function featureList(plan: ClinicPlan): string[] {
  const f = (plan.features ?? {}) as Record<string, unknown>
  const items: string[] = []
  if (plan.maxBookingsPerMonth) {
    items.push(`Up to ${plan.maxBookingsPerMonth} bookings / month`)
  }
  if (f.directory) items.push("Directory listing")
  if (f.whatsappLine) items.push("WhatsApp booking line")
  if (f.reminders) items.push("Appointment reminders")
  if (f.reviews) items.push("Patient reviews")
  if (f.priorityListing) items.push("Priority ranking on Find Care")
  if (f.multiDoctor) items.push("Multi-doctor clinic")
  if (f.queueAnalytics) items.push("Queue analytics")
  if (f.dedicatedSupport) items.push("Dedicated support")
  if (items.length === 0) items.push("Core booking & queue")
  return items
}

function statusTone(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
    case "TRIALING":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
    case "PAST_DUE":
    case "GRACE":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
    case "SUSPENDED":
    case "CANCELLED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    default:
      return "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function PracticeBillingPanel({
  practiceId,
  canManage,
  autoSubscribePlanId,
  subscriptionOnly = false,
}: Props) {
  const [data, setData] = useState<BillingPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [cancellingSchedule, setCancellingSchedule] = useState(false)
  const autoStartedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const res = await proctoService.getPracticeBilling(practiceId)
    if (res?.status === "successful" && res.data) {
      setData(res.data as BillingPayload)
    } else {
      setError(res?.message || "Could not load billing.")
      setData(null)
    }
    setLoading(false)
  }, [practiceId])

  useEffect(() => {
    void load()
  }, [load])

  const openCheckout = useCallback(
    async (checkout: CheckoutPayload) => {
      const prefill = data?.practice
        ? {
            name: data.practice.name,
            email: data.practice.email ?? undefined,
            contact: data.practice.phone ?? undefined,
          }
        : undefined

      await openRazorpaySubscriptionCheckout(checkout, {
        prefill,
        onSuccess: async (response) => {
          const payment = {
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySubscriptionId: response.razorpay_subscription_id,
            razorpaySignature: response.razorpay_signature,
          }

          let lastError = "Could not confirm payment."
          for (let attempt = 0; attempt < 3; attempt++) {
            const res = await proctoService.confirmPracticeBilling(
              practiceId,
              payment,
            )
            if (res?.status === "successful") {
              const ent = (
                res.data as { entitlement?: { usable?: boolean; planName?: string } }
              )?.entitlement
              if (ent && ent.usable === false) {
                lastError =
                  "Payment received but plan features are not active yet. Retrying…"
                await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
                continue
              }
              return
            }
            lastError = res?.message || lastError
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
          }

          // Poll billing — webhook may have activated while confirm retried
          const billing = await proctoService.getPracticeBilling(practiceId)
          const usable = Boolean(
            (billing?.data as { entitlement?: { usable?: boolean } })
              ?.entitlement?.usable,
          )
          if (usable) return

          throw new Error(
            `${lastError} Payment was received — refresh this page or contact support; do not pay again.`,
          )
        },
      })
    },
    [data?.practice, practiceId],
  )

  const choosePlan = useCallback(
    async function choosePlan(
      planId: string,
      mode: "trial" | "activate" | "change",
    ) {
      if (!canManage) {
        setError("Only clinic owners/admins can change the subscription.")
        return
      }
      setBusyPlanId(planId)
      setError("")
      setMessage("")

      const currentSub = data?.subscription
      const targetPlan = data?.plans.find((p) => p.id === planId)
      const isUpgrade =
        currentSub != null &&
        targetPlan != null &&
        targetPlan.priceMonthlyInr > (currentSub.plan.priceMonthlyInr ?? 0)

      const res = await proctoService.subscribePractice(practiceId, {
        planId,
        mode,
      })

      const payload = res?.data as
        | {
            subscription?: PracticeSubscription
            checkout?: CheckoutPayload | null
            scheduledPlan?: ClinicPlan | null
            effectiveAt?: string
          }
        | undefined

      const expectsCheckout =
        mode !== "trial" &&
        Boolean(data?.razorpayConfigured) &&
        (mode === "activate" ||
          (mode === "change" &&
            data?.subscription &&
            (data.plans.find((p) => p.id === planId)?.priceMonthlyInr ?? 0) >
              (data.subscription.plan.priceMonthlyInr ?? 0)))

      if (res?.status === "successful" || res?.status === "created") {
        if (payload?.checkout?.subscriptionId && payload.checkout.keyId) {
          try {
            setMessage("Opening checkout…")
            await openCheckout(payload.checkout)
            setMessage(
              "Payment successful — your plan features are now active.",
            )
            await load()
          } catch (err) {
            // Do NOT cancel pending checkout after a paid attempt — webhook /
            // retry confirm still need the pending Razorpay subscription id.
            const msg =
              err instanceof Error
                ? err.message
                : "Payment was not completed. You can try again."
            const paidButUnconfirmed = /payment was received|features are not active|do not pay again/i.test(
              msg,
            )
            if (!paidButUnconfirmed) {
              await proctoService
                .cancelPendingCheckout(practiceId)
                .catch(() => null)
            }
            setError(msg)
            await load()
          } finally {
            setBusyPlanId(null)
          }
          return
        }

        if (expectsCheckout) {
          setError(
            res?.message ||
              "Could not start checkout. Please try again.",
          )
          setBusyPlanId(null)
          return
        }

        setMessage(
          mode === "trial"
            ? "14-day trial started — directory & WhatsApp entitlements apply now."
            : payload?.scheduledPlan
              ? `Downgrade to ${payload.scheduledPlan.name} scheduled for ${formatDate(payload.effectiveAt ?? currentSub?.currentPeriodEnd)}.`
              : mode === "change" && !isUpgrade
                ? "Plan change scheduled for end of billing period."
                : mode === "change" || mode === "activate"
                  ? "Plan upgraded — new 1-month period started."
                  : "Subscription activated.",
        )
        await load()
        setBusyPlanId(null)
        return
      }
      setError(res?.message || "Could not update subscription.")
      setBusyPlanId(null)
    },
    [canManage, data, load, openCheckout, practiceId],
  )

  useEffect(() => {
    if (
      !autoSubscribePlanId ||
      !canManage ||
      !data?.razorpayConfigured ||
      loading ||
      autoStartedRef.current
    ) {
      return
    }
    autoStartedRef.current = true
    void choosePlan(autoSubscribePlanId, "activate").catch(() => {
      autoStartedRef.current = false
    })
  }, [
    autoSubscribePlanId,
    canManage,
    data?.razorpayConfigured,
    loading,
    choosePlan,
  ])

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
          />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
        {error || "Billing unavailable."}
      </p>
    )
  }

  const current = data.subscription
  const currentPlanId = current?.plan?.id
  const hasActivePlan =
    current != null && isUsableSubscription(current.status)
  const scheduledPlan = data.scheduledPlan ?? null
  const pendingCheckoutPlan = data.pendingCheckoutPlan ?? null
  const ent = data.entitlement
  const cap = ent?.maxBookingsPerMonth
  const used = ent?.bookingsUsedThisPeriod ?? 0
  const hasWhatsAppEntitlement =
    Boolean(ent?.features?.whatsappLine) ||
    ent?.features?.whatsappLine === 1 ||
    Number(ent?.features?.whatsappLine) > 0

  return (
    <div className="space-y-6">
      {!subscriptionOnly ? (
        <PracticeWhatsAppConnect
          practiceId={practiceId}
          canManage={canManage}
          whatsappNumber={data.practice.whatsappNumber}
          whatsappBusinessNumber={data.practice.whatsappBusinessNumber}
          clinicPhone={data.practice.phone}
          whatsappSetup={data.whatsappSetup}
          hasWhatsAppEntitlement={hasWhatsAppEntitlement}
          subscriptionUsable={Boolean(ent?.usable)}
          onConnected={() => void load()}
        />
      ) : null}

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900/40 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Subscription
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Features are enforced on the API and portal — directory, WhatsApp,
              booking caps, reminders, reviews, ranking, multi-doctor, and
              Clinic analytics.
            </p>
          </div>
          {hasActivePlan ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusTone(current!.status)}`}
            >
              {current!.status.replace(/_/g, " ")}
            </span>
          ) : pendingCheckoutPlan ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              Payment pending
            </span>
          ) : scheduledPlan ? (
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
              Change scheduled
            </span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              No plan
            </span>
          )}
        </div>

        {pendingCheckoutPlan ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
            Payment incomplete for{" "}
            <span className="font-semibold">{pendingCheckoutPlan.name}</span>.
            {hasActivePlan
              ? " Your current plan stays active until checkout completes."
              : " Complete checkout to activate your plan."}
          </p>
        ) : null}

        {scheduledPlan ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100">
            <p>
              Switching to{" "}
              <span className="font-semibold">{scheduledPlan.name}</span> on{" "}
              <span className="font-semibold">
                {formatDate(current?.currentPeriodEnd)}
              </span>
              . Your current plan stays active until then.
            </p>
            {canManage ? (
              <button
                type="button"
                disabled={cancellingSchedule}
                onClick={() => {
                  setCancellingSchedule(true)
                  setError("")
                  void proctoService
                    .cancelScheduledPlanChange(practiceId)
                    .then((res) => {
                      if (res?.status === "successful") {
                        setMessage("Scheduled plan change cancelled.")
                        return load()
                      }
                      setError(res?.message || "Could not cancel scheduled change.")
                    })
                    .finally(() => setCancellingSchedule(false))
                }}
                className="mt-2 text-xs font-semibold underline disabled:opacity-50"
              >
                {cancellingSchedule ? "Cancelling…" : "Cancel scheduled change"}
              </button>
            ) : null}
          </div>
        ) : null}

        {hasActivePlan ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Current plan
              </dt>
              <dd className="mt-1 font-semibold text-neutral-900 dark:text-white">
                {current!.plan.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Period ends
              </dt>
              <dd className="mt-1 font-semibold text-neutral-900 dark:text-white">
                {formatDate(current!.currentPeriodEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Bookings this period
              </dt>
              <dd className="mt-1 font-semibold text-neutral-900 dark:text-white">
                {used}
                {cap != null ? ` / ${cap}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Directory
              </dt>
              <dd className="mt-1 font-semibold text-neutral-900 dark:text-white">
                {data.practice.isDirectoryListed ? "Listed" : "Hidden"}
                {ent?.features?.priorityListing ? " · Featured" : ""}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            No subscription yet. Start a free trial or subscribe to list your
            clinic and unlock WhatsApp booking.
          </p>
        )}

        <p className="mt-3 text-xs text-neutral-500">
          Upgrades take effect immediately with a new 1-month billing period.
          Downgrades apply when your current period ends.
        </p>

        {data.razorpayConfigured ? (
          <p className="mt-1 text-xs text-neutral-500">
            Secure subscription checkout is enabled.
          </p>
        ) : null}

        {ent?.usable && ent.features?.dedicatedSupport ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <p className="font-semibold text-emerald-900 dark:text-emerald-100">
              Dedicated support (Clinic plan)
            </p>
            <p className="mt-1 text-emerald-800/80 dark:text-emerald-100/80">
              Priority ops help for WhatsApp go-live, billing, and directory
              listing. Email{" "}
              <a
                className="font-semibold underline"
                href="mailto:support@glucoguide.com"
              >
                support@glucoguide.com
              </a>{" "}
              with your clinic slug{" "}
              <span className="font-mono">{data.practice.slug}</span>.
            </p>
          </div>
        ) : null}

        {message ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {data.plans.map((plan) => {
          const isCurrent = hasActivePlan && currentPlanId === plan.id
          const features = featureList(plan)
          const recommended = plan.name === "Growth"
          const busy = busyPlanId === plan.id
          const isUpgrade =
            hasActivePlan &&
            current != null &&
            plan.priceMonthlyInr > (current.plan.priceMonthlyInr ?? 0)
          const isDowngrade =
            hasActivePlan &&
            current != null &&
            plan.priceMonthlyInr < (current.plan.priceMonthlyInr ?? 0)
          const isScheduledTarget = scheduledPlan?.id === plan.id
          const upgradeMode: "activate" | "change" =
            data.razorpayConfigured && isUpgrade ? "activate" : "change"

          return (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border bg-white p-5 dark:bg-neutral-900/40 ${
                isCurrent
                  ? "border-[#0099ff] shadow-[0_0_0_1px_#0099ff]"
                  : recommended
                    ? "border-[#0099ff]/40"
                    : "border-neutral-200 dark:border-neutral-700"
              }`}
            >
              {recommended ? (
                <span className="absolute -top-2.5 left-4 rounded-full bg-[#0099ff] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Popular
                </span>
              ) : null}

              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
                  {plan.name}
                </h3>
                {isCurrent ? (
                  <span className="text-xs font-bold uppercase text-[#0099ff]">
                    Current
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                ₹{plan.priceMonthlyInr.toLocaleString("en-IN")}
                <span className="text-sm font-medium text-neutral-500">
                  /mo
                </span>
              </p>

              <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
                {features.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#0099ff]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-col gap-2">
                {!current || !hasActivePlan ? (
                  <>
                    <button
                      type="button"
                      disabled={!canManage || busy}
                      onClick={() => void choosePlan(plan.id, "trial")}
                      className="inline-flex h-11 items-center justify-center rounded-lg border border-neutral-300 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-white/5"
                    >
                      {busy ? "Starting…" : "Start 14-day trial"}
                    </button>
                    <button
                      type="button"
                      disabled={!canManage || busy}
                      onClick={() => void choosePlan(plan.id, "activate")}
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-[#0099ff] text-sm font-semibold text-white transition hover:bg-[#0088e6] disabled:opacity-50"
                    >
                      {busy ? "Processing…" : "Subscribe"}
                    </button>
                  </>
                ) : isCurrent ? (
                  current.status === "TRIALING" && !data.razorpayConfigured ? (
                    <button
                      type="button"
                      disabled={!canManage || busy}
                      onClick={() => void choosePlan(plan.id, "activate")}
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-[#0099ff] text-sm font-semibold text-white transition hover:bg-[#0088e6] disabled:opacity-50"
                    >
                      {busy ? "Activating…" : "Activate paid plan"}
                    </button>
                  ) : current.status === "TRIALING" && data.razorpayConfigured ? (
                    <button
                      type="button"
                      disabled={!canManage || busy}
                      onClick={() => void choosePlan(plan.id, "activate")}
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-[#0099ff] text-sm font-semibold text-white transition hover:bg-[#0088e6] disabled:opacity-50"
                    >
                      {busy ? "Processing…" : "Subscribe"}
                    </button>
                  ) : (
                    <p className="py-2 text-center text-xs font-semibold text-neutral-500">
                      You are on this plan
                    </p>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={!canManage || busy || isScheduledTarget}
                    onClick={() => void choosePlan(plan.id, upgradeMode)}
                    className={`inline-flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition disabled:opacity-50 ${
                      isUpgrade && data.razorpayConfigured
                        ? "bg-[#0099ff] text-white hover:bg-[#0088e6]"
                        : "border border-neutral-300 text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-white/5"
                    }`}
                  >
                    {busy
                      ? "Processing…"
                      : isScheduledTarget
                        ? "Scheduled"
                        : isUpgrade
                          ? "Upgrade"
                          : isDowngrade
                            ? "Schedule downgrade"
                            : "Schedule change"}
                  </button>
                )}
                {!isUpgrade && hasActivePlan && !isCurrent && !isScheduledTarget ? (
                  <p className="text-center text-[11px] text-neutral-500">
                    Takes effect {formatDate(current?.currentPeriodEnd)}
                  </p>
                ) : isUpgrade ? (
                  <p className="text-center text-[11px] text-neutral-500">
                    New 1-month period starts on upgrade
                  </p>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {!canManage ? (
        <p className="text-xs text-neutral-500">
          Ask a clinic owner or admin to change the subscription.
        </p>
      ) : null}
    </div>
  )
}
