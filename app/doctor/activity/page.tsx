"use client"

import Link from "next/link"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import DoctorActivityHub from "@/components/ui/doctors/pages/DoctorActivityHub"

export default function DoctorActivityPage() {
  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        compact
        eyebrow="Practice"
        title="Support"
        subtitle="WhatsApp support chat — when a patient taps Talk to Support / Agent"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/doctor/notifications"
              className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 transition hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-white"
            >
              Booking alerts
            </Link>
            <Link
              href="/doctor/queue"
              className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 transition hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-white"
            >
              Queue
            </Link>
          </div>
        }
      />
      <DoctorActivityHub />
    </div>
  )
}
