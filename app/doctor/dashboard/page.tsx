"use client"

import { Suspense } from "react"
import Link from "next/link"
import { DoctorAnalytics } from "@/components"
import DoctorQueue from "@/components/ui/doctors/pages/DoctorQueue"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"

export default function DoctorDashboard() {
  const {
    practiceName,
    isIndependentPractice,
    isClinicStaffDoctor,
    ready,
  } = usePracticeDashboard()

  const eyebrow = isClinicStaffDoctor
    ? "Clinic staff · Doctor portal"
    : isIndependentPractice
      ? "Independent practice · Doctor portal"
      : "Doctor portal"

  const title = isClinicStaffDoctor ? (
    <>
      Queue at{" "}
      <span className="text-blue-600 dark:text-sky-400">
        {practiceName || "your clinic"}
      </span>
    </>
  ) : (
    <>
      Today at a{" "}
      <span className="text-blue-600 dark:text-sky-400">glance</span>
    </>
  )

  const subtitle = isClinicStaffDoctor
    ? `You are logged in under ${practiceName || "your clinic"}. Manage your own queue and patients; the clinic oversees the full roster.`
    : isIndependentPractice
      ? "Your solo practice is ready — live queue and summary metrics. Use Appointments, Patients, Calendar, and Analytics from the sidebar."
      : "Your live queue and summary metrics. Use Appointments, Patients, Calendar, and Analytics from the sidebar."

  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow={ready ? eyebrow : "Doctor portal"}
        title={title}
        subtitle={subtitle}
        actionBelow
        action={
          <>
            <Link href="/doctor/activity" className="dashboard-btn-primary">
              Support
            </Link>
            <Link href="/doctor/appointments" className="dashboard-btn-secondary">
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
            {isIndependentPractice ? (
              <>
                <Link
                  href="/settings?tab=practice"
                  className="dashboard-btn-secondary"
                >
                  Practice settings
                </Link>
                <Link
                  href="/doctor/subscription"
                  className="dashboard-btn-secondary"
                >
                  Subscription
                </Link>
              </>
            ) : (
              <Link
                href="/settings?tab=practice"
                className="dashboard-btn-secondary"
              >
                My hours
              </Link>
            )}
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
