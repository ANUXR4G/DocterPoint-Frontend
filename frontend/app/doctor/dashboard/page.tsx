"use client"

import { Suspense } from "react"
import Link from "next/link"
import { DoctorAnalytics } from "@/components"
import DoctorQueue from "@/components/ui/doctors/pages/DoctorQueue"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"

export default function DoctorDashboard() {
  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow="Doctor portal"
        title={
          <>
            Today at a{" "}
            <span className="text-blue-600 dark:text-sky-400">glance</span>
          </>
        }
        subtitle="Your live queue and summary metrics. Use Appointments, Patients, Calendar, and Analytics from the sidebar."
        actionBelow
        action={
          <>
            <Link href="/doctor/appointments" className="dashboard-btn-primary">
              Appointments
            </Link>
            <Link href="/doctor/patients" className="dashboard-btn-secondary">
              Patients
            </Link>
            <Link href="/doctor/calendar" className="dashboard-btn-secondary">
              Calendar
            </Link>
            <Link href="/doctor/analytics" className="dashboard-btn-secondary">
              Analytics
            </Link>
            <Link href="/settings?tab=practice" className="dashboard-btn-secondary">
              Practice settings
            </Link>
            <Link href="/doctor/subscription" className="dashboard-btn-secondary">
              Subscription
            </Link>
          </>
        }
      />

      <DoctorAnalytics />

      <section className="space-y-4">
        <div className="flex h-12 flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="dashboard-section-title">Today&apos;s queue</h2>
            <p className="dashboard-section-sub">
              Start, complete, or mark no-show without leaving this page
            </p>
          </div>
          <Link href="/doctor/queue" className="dashboard-link">
            Full-screen queue →
          </Link>
        </div>

        <div className="dashboard-section overflow-hidden">
          <div className="max-h-[min(65vh,640px)] min-h-[20rem] overflow-auto p-2 sm:p-3">
            <Suspense
              fallback={
                <p className="p-4 text-sm text-neutral-500">Loading queue…</p>
              }
            >
              <DoctorQueue compact showFilters allowStatusControl />
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  )
}
