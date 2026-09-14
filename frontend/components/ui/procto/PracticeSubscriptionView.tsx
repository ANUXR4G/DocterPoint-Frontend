"use client"

import Link from "next/link"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import PracticeBillingPanel from "@/components/ui/procto/PracticeBillingPanel"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import { usePracticeMembership } from "@/hooks/usePracticeMembership"

type Props = {
  portal: "doctor" | "clinic"
}

function SubscriptionContent({ portal }: Props) {
  const searchParams = useSearchParams()
  const autoPlanId = searchParams.get("subscribePlan")
  const { loading, practiceId, practiceName, canManage } = usePracticeMembership()

  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow={portal === "clinic" ? "Clinic portal" : "Doctor portal"}
        title="Subscription"
        subtitle={
          practiceName
            ? `Plan, usage limits, upgrades, and WhatsApp booking line for ${practiceName}.`
            : "Your current plan, usage limits, upgrades, and WhatsApp booking line setup."
        }
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : !practiceId ? (
        <div className="dashboard-panel flex flex-col items-center justify-center border-dashed p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No practice linked to this account yet.
          </p>
          <Link href="/settings?tab=practice" className="dashboard-link mt-4">
            Set up your practice →
          </Link>
        </div>
      ) : (
        <PracticeBillingPanel
          practiceId={practiceId}
          canManage={canManage}
          autoSubscribePlanId={autoPlanId}
        />
      )}
    </div>
  )
}

export default function PracticeSubscriptionView({ portal }: Props) {
  return (
    <Suspense
      fallback={
        <div className="dashboard-page-wide">
          <div className="dashboard-hero min-h-[10rem] animate-pulse" />
        </div>
      }
    >
      <SubscriptionContent portal={portal} />
    </Suspense>
  )
}
