"use client"

import Link from "next/link"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import PracticeNotificationsPanel from "@/components/ui/procto/PracticeNotificationsPanel"

export default function DoctorNotificationsPage() {
  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        compact
        eyebrow="Practice"
        title="Notifications"
        subtitle="Booking, queue, documents, overrides, and support alerts — tap a row to clear"
        action={
          <Link
            href="/doctor/queue"
            className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 transition hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-white"
          >
            Queue
          </Link>
        }
      />
      <PracticeNotificationsPanel />
    </div>
  )
}
