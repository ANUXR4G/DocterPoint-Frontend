"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  User,
  Clock,
  Filter,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { proctoService } from "@/lib/services/procto"
import { practiceTodayIso } from "@/lib/practiceTime"
import {
  buildDayScheduleReport,
  buildWeekScheduleReport,
  buildMonthScheduleReport,
  buildCustomScheduleReport,
  exportScheduleReportToCsv,
  formatReportDate,
  toDateKey,
  addDays,
  getDayOfWeek,
  type DoctorScheduleReportData,
  type ScheduleRuleItem,
  type ScheduleOverrideItem,
} from "@/lib/scheduleReport"

type CriteriaType = "day" | "week" | "month" | "custom"

interface DoctorScheduleReportProps {
  practiceId?: string | null
  memberships?: any[]
  isClinicAdmin?: boolean
}

export default function DoctorScheduleReport({
  practiceId,
  memberships,
}: DoctorScheduleReportProps) {
  const [criteria, setCriteria] = useState<CriteriaType>("week")
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("all")
  const [loading, setLoading] = useState<boolean>(false)

  // Current anchor date (defaults to today)
  const today = practiceTodayIso()
  const [anchorDate, setAnchorDate] = useState<string>(today)

  // Custom date inputs
  const [customFrom, setCustomFrom] = useState<string>(today)
  const [customTo, setCustomTo] = useState<string>(addDays(today, 30))

  // Data from backend
  const [doctorsList, setDoctorsList] = useState<Array<{ id: string; name: string; specialties?: string[] }>>([])
  const [schedules, setSchedules] = useState<ScheduleRuleItem[]>([])
  const [overrides, setOverrides] = useState<ScheduleOverrideItem[]>([])

  // Calculate week start (Sunday) for current anchor date
  const weekStartIso = useMemo(() => {
    const dow = getDayOfWeek(anchorDate)
    return addDays(anchorDate, -dow)
  }, [anchorDate])

  // Extract year and month from anchor date
  const { currentYear, currentMonth } = useMemo(() => {
    const d = new Date(`${anchorDate}T12:00:00Z`)
    return {
      currentYear: d.getUTCFullYear(),
      currentMonth: d.getUTCMonth() + 1, // 1..12
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

  // Fetch doctors and schedule rules from backend
  const loadScheduleData = useCallback(async () => {
    if (!practiceId) return
    setLoading(true)

    try {
      // Determine query date bounds
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

      const res = await (proctoService as any).getScheduleReport(practiceId, {
        providerId: selectedDoctorId,
        from: fromIso,
        to: toIso,
      })

      if (res?.status === "successful" && res?.data) {
        setDoctorsList(res.data.doctors || [])
        setSchedules(res.data.schedules || [])
        setOverrides(res.data.overrides || [])
      } else {
        // Fallback to active practice members if report endpoint unavailable
        const activePractice = memberships?.find((m) => m.practiceId === practiceId)?.practice
        if (activePractice?.members) {
          const docs = activePractice.members
            .filter((m: any) => m.role === "DOCTOR" || m.doctorId || m.user?.doctor)
            .map((m: any) => ({
              id: m.userId,
              name: m.user?.name || "Doctor",
              specialties: m.user?.doctor?.specialties?.map((s: any) => s.specialty?.name) || [],
            }))
          setDoctorsList(docs)
        }
      }
    } catch (err) {
      console.error("Failed to load schedule report data:", err)
      toast.error("Could not load schedule report. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [
    practiceId,
    selectedDoctorId,
    criteria,
    anchorDate,
    weekStartIso,
    currentYear,
    currentMonth,
    customFrom,
    customTo,
    memberships,
  ])

  useEffect(() => {
    loadScheduleData()
  }, [loadScheduleData])

  // Build report structures per doctor
  const reportData = useMemo<DoctorScheduleReportData[]>(() => {
    const targetDoctors =
      selectedDoctorId === "all"
        ? doctorsList
        : doctorsList.filter((d) => d.id === selectedDoctorId)

    if (targetDoctors.length === 0 && doctorsList.length > 0) {
      return []
    }

    return targetDoctors.map((doc) => {
      const docRules = schedules.filter((s) => s.providerId === doc.id)
      const docOverrides = overrides.filter((o) => o.providerId === doc.id)

      if (criteria === "day") {
        return buildDayScheduleReport(doc, anchorDate, docRules, docOverrides)
      } else if (criteria === "week") {
        return buildWeekScheduleReport(doc, weekStartIso, docRules, docOverrides)
      } else if (criteria === "month") {
        return buildMonthScheduleReport(doc, currentYear, currentMonth, docRules, docOverrides)
      } else {
        return buildCustomScheduleReport(doc, customFrom, customTo, docRules, docOverrides)
      }
    })
  }, [
    selectedDoctorId,
    doctorsList,
    schedules,
    overrides,
    criteria,
    anchorDate,
    weekStartIso,
    currentYear,
    currentMonth,
    customFrom,
    customTo,
  ])

  // Print Report Handler
  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  // Export CSV Handler
  const handleExportCsv = useCallback(() => {
    if (reportData.length === 0) {
      toast.error("No schedule data to export.")
      return
    }
    const csvContent = exportScheduleReportToCsv(reportData)
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `doctor_schedules_${criteria}_${practiceTodayIso()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("Schedule report exported to CSV.")
  }, [reportData, criteria])

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

          {/* Doctor Filter Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              <User className="h-3.5 w-3.5" /> Doctor:
            </span>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm focus:border-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <option value="all">All Doctors (Grouped)</option>
              {doctorsList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.specialties && d.specialties.length > 0 ? `(${d.specialties.join(", ")})` : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => loadScheduleData()}
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
              onClick={handlePrint}
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

      {/* Report Render View */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <RefreshCw className="h-4 w-4 animate-spin text-sky-600" /> Loading doctor schedules...
          </div>
        </div>
      ) : reportData.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <Calendar className="mb-2 h-8 w-8 text-neutral-400" />
          <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            No schedule records found
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            No active schedules found for the selected period or doctor.
          </p>
        </div>
      ) : (
        <div className="space-y-8 print:m-0 print:p-0">
          {reportData.map((report) => (
            <div
              key={report.doctorId}
              className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm print:rounded-none print:border-none print:p-0 print:shadow-none dark:border-neutral-800 dark:bg-neutral-900"
            >
              {/* Doctor Name & Date Range Header */}
              <div className="mb-4 flex flex-col justify-between border-b border-neutral-200 pb-3 sm:flex-row sm:items-center dark:border-neutral-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold uppercase tracking-wide text-neutral-900 dark:text-white">
                    Dr Name:
                  </span>
                  <span className="text-base font-bold text-sky-700 dark:text-sky-400">
                    {report.doctorName}
                  </span>
                  {report.specialties && report.specialties.length > 0 && (
                    <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {report.specialties.join(", ")}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs font-semibold text-neutral-600 sm:mt-0 dark:text-neutral-300">
                  {report.fromToLabel}
                </div>
              </div>

              {/* Sections (e.g. Month blocks or Week table) */}
              <div className="space-y-6">
                {report.sections.map((sec, secIdx) => (
                  <div key={secIdx} className="space-y-2">
                    {sec.title && (
                      <div className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                        {sec.title}
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
                            <th className="py-2.5 px-3 font-bold w-12 text-center">Sno</th>
                            <th className="py-2.5 px-3 font-bold w-28">Date</th>
                            <th className="py-2.5 px-3 font-bold w-28">Day</th>
                            <th className="py-2.5 px-3 font-bold w-24">From time</th>
                            <th className="py-2.5 px-3 font-bold w-24">To Time</th>
                            <th className="py-2.5 px-3 font-bold w-28">Break Time From</th>
                            <th className="py-2.5 px-3 font-bold w-28">Break Time to</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {sec.rows.map((row) => (
                            <tr
                              key={row.sno}
                              className={`transition-colors ${
                                row.isOff
                                  ? "bg-neutral-50/40 text-neutral-400 dark:bg-neutral-900/40 dark:text-neutral-500"
                                  : "hover:bg-neutral-50/80 text-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-800/30"
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center font-medium">{row.sno}</td>
                              <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                                {row.date || ""}
                              </td>
                              <td className="py-2.5 px-3 font-semibold">{row.day}</td>
                              <td className="py-2.5 px-3 font-medium">
                                {row.fromTime ? (
                                  <span className="font-semibold text-neutral-900 dark:text-white">
                                    {row.fromTime}
                                  </span>
                                ) : (
                                  ""
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-medium">
                                {row.toTime ? (
                                  <span className="font-semibold text-neutral-900 dark:text-white">
                                    {row.toTime}
                                  </span>
                                ) : (
                                  ""
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-400">
                                {row.breakTimeFrom || ""}
                              </td>
                              <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-400">
                                {row.breakTimeTo || ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
