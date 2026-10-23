"use client"

import React, { useState, Suspense } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Calendar, Users, FileText, BarChart3, Clock } from "lucide-react"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import DoctorPortalLinks from "@/components/ui/doctors/DoctorPortalLinks"
import ClinicPortalLinks from "@/components/ui/clinics/ClinicPortalLinks"
import DoctorScheduleReport from "@/components/ui/doctors/reports/DoctorScheduleReport"
import PatientVisitReport from "@/components/ui/doctors/reports/PatientVisitReport"
import PatientAppointmentReport from "@/components/ui/doctors/reports/PatientAppointmentReport"

interface DoctorReportsPageProps {
  portal?: "doctor" | "clinic"
}

export default function DoctorReportsPage({
  portal = "doctor",
}: DoctorReportsPageProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab") || "schedule"

  const { practiceId, memberships, isClinicAdmin, ready } = usePracticeDashboard()

  const handleTabChange = (tabKey: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tabKey)
    router.push(`${pathname}?${params.toString()}`)
  }

  const tabs = [
    {
      id: "schedule",
      label: "Doctor Schedule Report",
      icon: Clock,
      description: "Schedule hours and breaks by day, week, month, or custom period",
    },
    {
      id: "visits",
      label: "Patient Visits Report",
      icon: Users,
      description: "Visits by doctor with appointment time, arrival time, and consultation status",
    },
    {
      id: "appointments",
      label: "Patient Appointment Report",
      icon: FileText,
      description: "Appointment breakdown and metrics across different booking statuses",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Portal Cross Links Navigation */}
      <div className="no-print">
        {portal === "clinic" ? <ClinicPortalLinks /> : <DoctorPortalLinks />}
      </div>

      {/* Report Switcher Tabs */}
      <div className="no-print rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = currentTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-start gap-3 rounded-xl p-3 text-left transition ${
                  active
                    ? "bg-sky-50 border border-sky-200 text-sky-950 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-100"
                    : "border border-transparent hover:bg-neutral-50 text-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <div
                  className={`mt-0.5 rounded-lg p-2 ${
                    active
                      ? "bg-sky-600 text-white dark:bg-sky-500"
                      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs font-bold ${
                      active
                        ? "text-sky-900 dark:text-sky-200"
                        : "text-neutral-800 dark:text-neutral-200"
                    }`}
                  >
                    {tab.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500 line-clamp-1 dark:text-neutral-400">
                    {tab.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Report View */}
      <div>
        {currentTab === "schedule" && (
          <DoctorScheduleReport
            practiceId={practiceId || undefined}
            memberships={memberships}
            isClinicAdmin={isClinicAdmin}
          />
        )}

        {currentTab === "visits" && (
          <PatientVisitReport
            practiceId={practiceId || undefined}
            memberships={memberships}
            isClinicAdmin={isClinicAdmin}
          />
        )}

        {currentTab === "appointments" && (
          <PatientAppointmentReport
            practiceId={practiceId || undefined}
            memberships={memberships}
            isClinicAdmin={isClinicAdmin}
          />
        )}
      </div>
    </div>
  )
}
