"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { usePathname, useRouter } from "next/navigation"
import { endOfMonth, format, startOfMonth, startOfToday } from "date-fns"
import { InsightStatCard } from "@/components/dashboard/InsightStatCard"
import { practiceTabHref } from "@/lib/doctorPracticeTabs"
import { useAnalytics, genderSum } from "@/hooks/useAnalysis"
import {
  filterBookingsByDate,
  filterBookingsByRange,
  usePracticeDashboard,
} from "@/contexts/PracticeDashboardContext"

const AnalyticsChartsStrip = dynamic(
  () =>
    import("./AnalyticsChartsStrip").then((m) => m.AnalyticsChartsStrip),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="dashboard-grid-3 animate-pulse"
        aria-label="Loading charts"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="min-h-[14rem] rounded-2xl bg-slate-100 dark:bg-white/5"
          />
        ))}
      </div>
    ),
  },
)

/** Metric cards + chart strip from live Procto practice bookings. */
export default function Analytics() {
  const { bookings: allBookings, patients, ready } =
    usePracticeDashboard()
  const [queueCount, setQueueCount] = useState(0)
  const [livePatients, setLivePatients] = useState(0)
  const [liveAppointments, setLiveAppointments] = useState(0)
  const router = useRouter()
  const pathname = usePathname() || ""
  const isClinic = pathname.startsWith("/clinic")
  const appointmentsHref = isClinic
    ? "/clinic/appointments"
    : "/doctor/appointments"
  const queueHref = isClinic ? "/clinic/queue" : "/doctor/queue"

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

  // Prefer live Procto roster/bookings so cards never show 0 while the queue
  // has visits (analytics series can lag or zero-fill before charts load).
  const patientsValue = Math.max(livePatients, monthPatients)
  const appointmentsValue = Math.max(liveAppointments, monthAppointments)

  useEffect(() => {
    if (!practiceId || !ready) {
      if (!practiceId) {
        setQueueCount(0)
        setLivePatients(0)
        setLiveAppointments(0)
      }
      return
    }
    const today = startOfToday()
    const date = format(today, "yyyy-MM-dd")
    const from = format(startOfMonth(today), "yyyy-MM-dd")
    const to = format(endOfMonth(today), "yyyy-MM-dd")

    const todayList = filterBookingsByDate(allBookings, date)
    const monthList = filterBookingsByRange(allBookings, from, to)

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
  }, [practiceId, ready, allBookings, patients.length])

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
          href={appointmentsHref}
          icon="calendar"
          tone="blue"
          onNavigate={handleNavigation}
        />
        <InsightStatCard
          title="On queue today"
          value={queueCount}
          subtitle="Open today's clinic queue"
          href={queueHref}
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
