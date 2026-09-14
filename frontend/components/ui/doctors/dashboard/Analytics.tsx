"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { endOfMonth, format, startOfMonth, startOfToday } from "date-fns"
import { InsightStatCard } from "@/components/dashboard/InsightStatCard"
import { practiceTabHref } from "@/lib/doctorPracticeTabs"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import { useAnalytics, genderSum } from "@/hooks/useAnalysis"

const AnalyticsChartsStrip = dynamic(
  () =>
    import("./AnalyticsChartsStrip").then((m) => m.AnalyticsChartsStrip),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-neutral-500">Loading charts…</p>
    ),
  },
)

/** Metric cards + chart strip from live Procto practice bookings. */
export default function Analytics() {
  const [queueCount, setQueueCount] = useState(0)
  const [livePatients, setLivePatients] = useState(0)
  const [liveAppointments, setLiveAppointments] = useState(0)
  const router = useRouter()

  const today = startOfToday()
  const currentMonthName = format(today, "MMMM")

  // Year series enables MoM %; card values use the current month bucket.
  const {
    calculatePercentage,
    data: yearSeries,
    practiceId,
    planLocked,
  } = useAnalytics("year")

  const patientAnalysis = calculatePercentage()
  const appointmentAnalysis = calculatePercentage("appointments")

  const monthPatients = genderSum(yearSeries?.[currentMonthName]?.patients)
  const monthAppointments = genderSum(
    yearSeries?.[currentMonthName]?.appointments,
  )

  const patientsValue = planLocked ? livePatients : monthPatients
  const appointmentsValue = planLocked ? liveAppointments : monthAppointments

  useEffect(() => {
    if (!practiceId) {
      setQueueCount(0)
      setLivePatients(0)
      setLiveAppointments(0)
      return
    }
    let cancelled = false
    const today = startOfToday()
    const date = format(today, "yyyy-MM-dd")
    const from = format(startOfMonth(today), "yyyy-MM-dd")
    const to = format(endOfMonth(today), "yyyy-MM-dd")

    void Promise.all([
      proctoService.listPracticeBookings(practiceId, date),
      proctoService.listPracticeBookings(practiceId, { from, to }),
      proctoService.listPracticePatients(practiceId),
    ]).then(([todayRes, monthRes, patientsRes]) => {
      if (cancelled) return
      const todayList = (todayRes?.data ?? []) as ProctoBooking[]
      const monthList = (monthRes?.data ?? []) as ProctoBooking[]
      const patients = Array.isArray(patientsRes?.data) ? patientsRes.data : []

      const active = todayList.filter((b) => {
        const s = (b.status || "").toUpperCase()
        return [
          "SCHEDULED",
          "REQUESTED",
          "ACCEPTED",
          "IN_PROGRESS",
          "BOOKED",
          "CONFIRMED",
          "WAITING",
          "CHECKED_IN",
        ].includes(s)
      })
      setQueueCount(active.length)
      setLiveAppointments(monthList.length)
      setLivePatients(patients.length)
    })
    return () => {
      cancelled = true
    }
  }, [practiceId])

  function handleNavigation(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    url: string,
  ) {
    e.preventDefault()
    if (e.ctrlKey) window.open(url, "_blank")
    else router.push(url)
  }

  return (
    <div className="space-y-4">
      <div className="dashboard-grid-3">
        <InsightStatCard
          title="Patients"
          value={patientsValue}
          subtitle={
            planLocked
              ? "Clinic patients"
              : `${patientAnalysis >= 0 ? "Increase" : "Decrease"} of ${Math.abs(patientAnalysis)}% vs last month`
          }
          href={practiceTabHref("patients")}
          icon="three-people"
          tone="green"
          onNavigate={handleNavigation}
        />
        <InsightStatCard
          title="Appointments"
          value={appointmentsValue}
          subtitle={
            planLocked
              ? "Bookings this month"
              : `${appointmentAnalysis >= 0 ? "Increase" : "Decrease"} of ${Math.abs(appointmentAnalysis)}% vs last month · view completed`
          }
          href="/doctor/appointments"
          icon="calendar"
          tone="blue"
          onNavigate={handleNavigation}
        />
        <InsightStatCard
          title="On queue today"
          value={queueCount}
          subtitle="Open today's clinic queue"
          href="/doctor/queue"
          icon="inbox"
          tone="amber"
          onNavigate={handleNavigation}
        />
      </div>
      <AnalyticsChartsStrip />
    </div>
  )
}

export { AnalyticsChartsStrip } from "./AnalyticsChartsStrip"
