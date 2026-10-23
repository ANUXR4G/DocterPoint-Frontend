"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import {
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  User,
  Clock,
  Filter,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock3,
} from "lucide-react"
import { toast } from "sonner"
import { proctoService } from "@/lib/services/procto"
import { practiceTodayIso, formatPracticeDateTime, formatPracticeTime } from "@/lib/practiceTime"
import { formatReportDate, addDays, getDayOfWeek } from "@/lib/scheduleReport"

type CriteriaType = "day" | "week" | "month" | "custom"

interface PatientVisitReportProps {
  practiceId?: string | null
  memberships?: any[]
  isClinicAdmin?: boolean
}

export default function PatientVisitReport({
  practiceId,
  memberships,
}: PatientVisitReportProps) {
  const [criteria, setCriteria] = useState<CriteriaType>("day")
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [loading, setLoading] = useState<boolean>(false)

  // Current anchor date (defaults to today)
  const today = practiceTodayIso()
  const [anchorDate, setAnchorDate] = useState<string>(today)

  // Custom date inputs
  const [customFrom, setCustomFrom] = useState<string>(today)
  const [customTo, setCustomTo] = useState<string>(addDays(today, 7))

  // Data
  const [doctorsList, setDoctorsList] = useState<Array<{ id: string; name: string }>>([])
  const [bookings, setBookings] = useState<any[]>([])

  // Calculate week start (Sunday) for current anchor date
  const weekStartIso = useMemo(() => {
    const dow = getDayOfWeek(anchorDate)
    return addDays(anchorDate, -dow)
  }, [anchorDate])

  const { currentYear, currentMonth } = useMemo(() => {
    const d = new Date(`${anchorDate}T12:00:00Z`)
    return {
      currentYear: d.getUTCFullYear(),
      currentMonth: d.getUTCMonth() + 1,
    }
  }, [anchorDate])

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    if (criteria === "day") {
      setAnchorDate((prev) => addDays(prev, -1))
    } else if (criteria === "week") {
      setAnchorDate((prev) => addDays(prev, -7))
    } else if (criteria === "month") {
      const d = new Date(`${anchorDate}T12:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() - 1)
      setAnchorDate(d.toISOString().slice(0, 10))
    }
  }, [criteria, anchorDate])

  const handleNext = useCallback(() => {
    if (criteria === "day") {
      setAnchorDate((prev) => addDays(prev, 1))
    } else if (criteria === "week") {
      setAnchorDate((prev) => addDays(prev, 7))
    } else if (criteria === "month") {
      const d = new Date(`${anchorDate}T12:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() + 1)
      setAnchorDate(d.toISOString().slice(0, 10))
    }
  }, [criteria, anchorDate])

  // Fetch doctors list from practice memberships
  useEffect(() => {
    const activePractice = memberships?.find((m) => m.practiceId === practiceId)?.practice
    if (activePractice?.members) {
      const docs = activePractice.members
        .filter((m: any) => m.role === "DOCTOR" || m.doctorId || m.user?.doctor)
        .map((m: any) => ({
          id: m.userId,
          name: m.user?.name || "Doctor",
        }))
      setDoctorsList(docs)
    }
  }, [practiceId, memberships])

  // Fetch visits
  const loadVisitsData = useCallback(async () => {
    if (!practiceId) return
    setLoading(true)

    try {
      let fromIso = anchorDate
      let toIso = anchorDate

      if (criteria === "day") {
        fromIso = anchorDate
        toIso = anchorDate
      } else if (criteria === "week") {
        fromIso = weekStartIso
        toIso = addDays(weekStartIso, 6)
      } else if (criteria === "month") {
        const mm = String(currentMonth).padStart(2, "0")
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
        fromIso = `${currentYear}-${mm}-01`
        toIso = `${currentYear}-${mm}-${String(daysInMonth).padStart(2, "0")}`
      } else if (criteria === "custom") {
        fromIso = customFrom
        toIso = customTo
      }

      const res = await proctoService.listPracticeBookings(practiceId, {
        from: fromIso,
        to: toIso,
        providerId: selectedDoctorId !== "all" ? selectedDoctorId : undefined,
        status: selectedStatus !== "all" ? selectedStatus : undefined,
      })

      if (res?.status === "successful" && Array.isArray(res?.data)) {
        setBookings(res.data)
      } else {
        setBookings([])
      }
    } catch (err) {
      console.error("Failed to load visits report:", err)
      toast.error("Failed to load patient visits.")
    } finally {
      setLoading(false)
    }
  }, [
    practiceId,
    selectedDoctorId,
    selectedStatus,
    criteria,
    anchorDate,
    weekStartIso,
    currentYear,
    currentMonth,
    customFrom,
    customTo,
  ])

  useEffect(() => {
    loadVisitsData()
  }, [loadVisitsData])

  // Metrics summary calculation
  const metrics = useMemo(() => {
    const total = bookings.length
    const arrived = bookings.filter((b) => b.arrivedAt || b.status === "WAITING").length
    const inProgress = bookings.filter((b) => b.status === "IN_PROGRESS").length
    const completed = bookings.filter((b) => b.status === "COMPLETED").length
    const noShow = bookings.filter((b) => b.status === "NO_SHOW").length
    const cancelled = bookings.filter((b) => b.status === "CANCELED").length

    return { total, arrived, inProgress, completed, noShow, cancelled }
  }, [bookings])

  // Export to CSV
  const handleExportCsv = useCallback(() => {
    if (bookings.length === 0) {
      toast.error("No visits data to export.")
      return
    }

    const headers = [
      "Sno",
      "Patient Name",
      "Phone / MRN",
      "Doctor",
      "Appointment Date & Time",
      "Arrival Time",
      "Status",
      "Consultation Type",
      "Mode",
    ]

    const rows = bookings.map((b, idx) => {
      const apptTime = b.slotStart ? formatPracticeDateTime(b.slotStart) : b.sessionDate ? formatReportDate(b.sessionDate) : ""
      const arrival = b.arrivedAt ? formatPracticeTime(b.arrivedAt) : "Not Arrived"
      const phoneMrn = [b.patientPhone, b.patient?.mrn].filter(Boolean).join(" / ")

      return [
        idx + 1,
        `"${(b.patientName || "Guest").replace(/"/g, '""')}"`,
        `"${phoneMrn.replace(/"/g, '""')}"`,
        `"${(b.provider?.name || "Doctor").replace(/"/g, '""')}"`,
        `"${apptTime.replace(/"/g, '""')}"`,
        `"${arrival.replace(/"/g, '""')}"`,
        `"${b.status}"`,
        `"${(b.consultationType || "General").replace(/"/g, '""')}"`,
        `"${b.mode || "SLOT_BASED"}"`,
      ].join(",")
    })

    const csvContent = [headers.join(","), ...rows].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `patient_visits_${criteria}_${practiceTodayIso()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("Patient visits report exported to CSV.")
  }, [bookings, criteria])

  return (
    <div className="space-y-6">
      {/* Controls & Filter Bar */}
      <div className="no-print rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Criteria Segmented Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Criteria:
            </span>
            {(["day", "week", "month", "custom"] as CriteriaType[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCriteria(c)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold uppercase transition ${
                  criteria === c
                    ? "bg-sky-600 text-white shadow-sm dark:bg-sky-500"
                    : "border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Filters: Doctor & Status */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              <User className="h-3.5 w-3.5" /> Doctor:
            </span>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <option value="all">All Doctors</option>
              {doctorsList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <span className="ml-2 flex items-center gap-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              <Filter className="h-3.5 w-3.5" /> Status:
            </span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <option value="all">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="WAITING">Arrived / Waiting</option>
              <option value="IN_PROGRESS">In Consultation</option>
              <option value="COMPLETED">Completed</option>
              <option value="NO_SHOW">No Show</option>
              <option value="CANCELED">Cancelled</option>
            </select>

            <button
              type="button"
              onClick={() => loadVisitsData()}
              className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Date Navigation or Custom Pickers */}
        <div className="mt-4 flex flex-col gap-3 border-t border-neutral-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
          {criteria !== "custom" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevious}
                className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>

              <div className="rounded-xl bg-neutral-100 px-3.5 py-1.5 text-xs font-bold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                {criteria === "day" && `Day: ${formatReportDate(anchorDate)}`}
                {criteria === "week" &&
                  `Week: ${formatReportDate(weekStartIso)} to ${formatReportDate(addDays(weekStartIso, 6))}`}
                {criteria === "month" &&
                  `Month: ${new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
                    new Date(currentYear, currentMonth - 1, 1),
                  )}`}
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                From Date:
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-800 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                />
              </label>

              <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                To Date:
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-800 focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                />
              </label>
            </div>
          )}

          {/* Action Buttons: Print & CSV Export */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <Printer className="h-3.5 w-3.5 text-neutral-500" /> Print Report
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="no-print grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Total Visits</p>
          <p className="mt-1 text-xl font-extrabold text-neutral-900 dark:text-white">{metrics.total}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Arrived / In Clinic</p>
          <p className="mt-1 text-xl font-extrabold text-amber-900 dark:text-amber-200">{metrics.arrived}</p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-3.5 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">In Consultation</p>
          <p className="mt-1 text-xl font-extrabold text-sky-900 dark:text-sky-200">{metrics.inProgress}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Completed</p>
          <p className="mt-1 text-xl font-extrabold text-emerald-900 dark:text-emerald-200">{metrics.completed}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3.5 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">No Show</p>
          <p className="mt-1 text-xl font-extrabold text-rose-900 dark:text-rose-200">{metrics.noShow}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-800/50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Cancelled</p>
          <p className="mt-1 text-xl font-extrabold text-neutral-700 dark:text-neutral-300">{metrics.cancelled}</p>
        </div>
      </div>

      {/* Visits Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm print:rounded-none print:border-none print:p-0 print:shadow-none dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex flex-col justify-between border-b border-neutral-200 pb-3 sm:flex-row sm:items-center dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold uppercase tracking-wide text-neutral-900 dark:text-white">
              Patient Visits Report
            </span>
            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {bookings.length} {bookings.length === 1 ? "record" : "records"}
            </span>
          </div>
          <div className="mt-1 text-xs font-semibold text-neutral-600 sm:mt-0 dark:text-neutral-300">
            {criteria === "day" && `Date: ${formatReportDate(anchorDate)}`}
            {criteria === "week" &&
              `From Date : ${formatReportDate(weekStartIso)} to ${formatReportDate(addDays(weekStartIso, 6))}`}
            {criteria === "month" &&
              `From Date : ${formatReportDate(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`)} TO ${formatReportDate(
                `${currentYear}-${String(currentMonth).padStart(2, "0")}-${new Date(currentYear, currentMonth, 0).getDate()}`,
              )}`}
            {criteria === "custom" &&
              `From Date : ${formatReportDate(customFrom)} to ${formatReportDate(customTo)}`}
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-neutral-500">
              <RefreshCw className="h-4 w-4 animate-spin text-sky-600" /> Loading patient visits...
            </div>
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <Users className="mb-2 h-8 w-8 text-neutral-400" />
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              No patient visits recorded
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              No visits found for the selected timeframe, doctor, or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
                  <th className="py-2.5 px-3 font-bold w-12 text-center">Sno</th>
                  <th className="py-2.5 px-3 font-bold">Patient Name</th>
                  <th className="py-2.5 px-3 font-bold">Phone / MRN</th>
                  <th className="py-2.5 px-3 font-bold">Doctor</th>
                  <th className="py-2.5 px-3 font-bold">Appointment Time</th>
                  <th className="py-2.5 px-3 font-bold">Arrival Time</th>
                  <th className="py-2.5 px-3 font-bold">Status</th>
                  <th className="py-2.5 px-3 font-bold">Type / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {bookings.map((b, idx) => {
                  const arrivalFormatted = b.arrivedAt
                    ? formatPracticeTime(b.arrivedAt)
                    : "—"
                  const apptFormatted = b.slotStart
                    ? formatPracticeDateTime(b.slotStart)
                    : b.sessionDate
                    ? `${formatReportDate(b.sessionDate)}${b.tokenNumber ? ` (Token #${b.tokenNumber})` : ""}`
                    : "—"

                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-neutral-50/80 text-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-800/30"
                    >
                      <td className="py-2.5 px-3 text-center font-medium">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-900 dark:text-white">
                        {b.patientName || "Guest Patient"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                        {b.patientPhone}
                        {b.patient?.mrn ? ` · MRN: ${b.patient.mrn}` : ""}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-sky-700 dark:text-sky-400">
                        {b.provider?.name || "Doctor"}
                      </td>
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                        {apptFormatted}
                      </td>
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                        {b.arrivedAt ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {arrivalFormatted}
                          </span>
                        ) : (
                          <span className="text-neutral-400">Not arrived</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            b.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : b.status === "IN_PROGRESS"
                              ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                              : b.status === "WAITING"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                              : b.status === "NO_SHOW"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                              : b.status === "CANCELED"
                              ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                              : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-400">
                        {b.consultationType || b.disease || "Consultation"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
