import { useEffect, useState } from "react"
import { format, startOfToday } from "date-fns"
import { months } from "@/lib/dummy/calender"
import { AnalyticMetrics, TypeAnalytics, TypeAnalyticsParam } from "@/types"
import { proctoService } from "@/lib/services/procto"
import { usePracticeDashboardOptional } from "@/contexts/PracticeDashboardContext"
import { useApi } from "./useApi"

export function genderSum(g?: {
  male?: number
  female?: number
  others?: number
  unknown?: number
}) {
  return (
    (g?.male ?? 0) +
    (g?.female ?? 0) +
    (g?.others ?? 0) +
    (g?.unknown ?? 0)
  )
}

/**
 * Practice analytics from Procto bookings (not legacy appointments).
 */
export function useAnalytics(
  param: TypeAnalyticsParam = "week",
  providerId?: string | null,
): {
  data?: TypeAnalytics
  isLoading: boolean
  errorMessage: string | null
  planLocked: boolean
  totalPatients: number
  totalAppointments: number
  patientMetrics: AnalyticMetrics[]
  appointmentMetrics: AnalyticMetrics[]
  byDoctor: Array<{
    providerId: string
    name: string
    bookings: number
    waiting: number
    inProgress: number
    completed: number
    canceled: number
    noShow: number
  }>
  calculatePercentage: (type?: "patients" | "appointments") => number
  practiceId: string | null
  practiceName: string
} {
  const [totalAppointments, setTotalAppointments] = useState(0)
  const [totalPatients, setTotalPatients] = useState(0)
  const [practiceId, setPracticeId] = useState<string | null>(null)
  const [practiceName, setPracticeName] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [planLocked, setPlanLocked] = useState(false)

  const dash = usePracticeDashboardOptional()
  const practiceFromShell = dash?.practiceId ?? null

  const { data: mine, isLoading: mineLoading } = useApi(
    ["procto:practices:mine:analytics"],
    () => proctoService.getMyPractices(),
    {
      enabled: !practiceFromShell,
      select: (res) => {
        if (res?.status !== "successful" || !Array.isArray(res.data)) {
          return null
        }
        const m = res.data[0] as {
          practice?: { id: string; name: string }
        }
        return m?.practice ?? null
      },
    },
  )

  useEffect(() => {
    if (practiceFromShell) {
      setPracticeId(practiceFromShell)
      setPracticeName(dash?.practiceName ?? "")
      return
    }
    if (!mine) {
      setPracticeId(null)
      setPracticeName("")
      return
    }
    setPracticeId(mine.id)
    setPracticeName(mine.name)
  }, [practiceFromShell, dash?.practiceName, mine])

  const today = startOfToday()
  const currentCurrentMonth = format(today, "MMMM")

  const { data, isLoading: analyticsLoading } = useApi(
    [`procto:practice:${practiceId}:analytics`, { param, providerId }],
    () => {
      if (!practiceId) throw new Error("No practice")
      return proctoService.getPracticeAnalytics(practiceId, param, providerId)
    },
    {
      enabled: !!practiceId,
      select: (payload) => {
        if (payload?.status === "unsuccessful") {
          return {
            __error: true as const,
            message: String(payload.message ?? "Analytics unavailable"),
          }
        }
        const raw =
          payload?.status === "successful" && payload.data
            ? payload.data
            : payload
        if (!raw || typeof raw !== "object") return raw as TypeAnalytics

        const nested = raw as {
          series?: TypeAnalytics
          byDoctor?: unknown
          __error?: boolean
        }
        if (nested.series && typeof nested.series === "object") {
          return {
            ...nested.series,
            __byDoctor: nested.byDoctor ?? [],
          } as TypeAnalytics & { __byDoctor?: unknown }
        }
        return raw as TypeAnalytics
      },
    },
  )

  useEffect(() => {
    if (
      data &&
      typeof data === "object" &&
      "__error" in data &&
      (data as { __error?: boolean }).__error
    ) {
      const msg = String(
        (data as { message?: string }).message ??
          "Queue analytics requires the Clinic plan.",
      )
      setErrorMessage(msg)
      setPlanLocked(
        /active subscription|subscribe|renew|billing|clinic plan|upgrade|queue analytics|does not include|practice analytics/i.test(
          msg,
        ),
      )
      setTotalPatients(0)
      setTotalAppointments(0)
      return
    }
    setErrorMessage(null)
    setPlanLocked(false)
    if (!data || typeof data !== "object") {
      setTotalPatients(0)
      setTotalAppointments(0)
      return
    }
    const analytics = data as TypeAnalytics & { __byDoctor?: unknown }
    const cells = Object.entries(analytics).filter(
      ([key, value]) =>
        key !== "__byDoctor" &&
        value &&
        typeof value === "object" &&
        "patients" in (value as object),
    ) as Array<[string, TypeAnalytics[string]]>

    // Always sum all period cells (year must not collapse to current month name).
    const patientCount = cells.reduce(
      (s, [, cell]) => s + genderSum(cell.patients),
      0,
    )
    const appointmentCount = cells.reduce(
      (s, [, cell]) => s + genderSum(cell.appointments),
      0,
    )

    setTotalPatients(patientCount)
    setTotalAppointments(appointmentCount)
  }, [data])

  function calculatePercentage(type: "patients" | "appointments" = "patients") {
    const currentIdx = Number(format(today, "M"))
    if (
      !data ||
      (typeof data === "object" && "__error" in data) ||
      param === "week" ||
      param === "day" ||
      param === "month" ||
      param === "yoy" ||
      currentIdx === 1
    ) {
      return 0
    }

    // MoM: requires year-shaped series (month name keys).
    const analytics = data as TypeAnalytics
    const previousMonth = months[currentIdx - 2]
    if (!previousMonth || !analytics[previousMonth] || !analytics[currentCurrentMonth]) {
      return 0
    }

    const previousTotal = genderSum(
      type === "patients"
        ? analytics[previousMonth].patients
        : analytics[previousMonth].appointments,
    )

    if (previousTotal === 0) return 0

    const currentTotal = genderSum(
      type === "patients"
        ? analytics[currentCurrentMonth].patients
        : analytics[currentCurrentMonth].appointments,
    )

    return Number(
      (((currentTotal - previousTotal) / previousTotal) * 100).toFixed(2),
    )
  }

  const analyticsData =
    data && typeof data === "object" && !("__error" in data)
      ? (() => {
          const raw = data as TypeAnalytics & { __byDoctor?: unknown }
          const { __byDoctor: _bd, ...series } = raw as TypeAnalytics & {
            __byDoctor?: unknown
          }
          return series as TypeAnalytics
        })()
      : undefined

  const byDoctor =
    data && typeof data === "object" && !("__error" in data)
      ? ((
          data as {
            __byDoctor?: Array<{
              providerId: string
              name: string
              bookings: number
              waiting: number
              inProgress: number
              completed: number
              canceled: number
              noShow: number
            }>
          }
        ).__byDoctor ?? [])
      : []

  const patientMetrics = analyticsData
    ? Object.entries(analyticsData)
        .filter(([key]) => key !== "__byDoctor")
        .map(([key, value]) => ({
          name: key,
          male: value.patients.male,
          female: value.patients.female,
          others: value.patients.others ?? 0,
          unknown: value.patients.unknown ?? 0,
          hasMetrics: genderSum(value.patients) > 0,
          compareMale: value.compare?.patients.male,
          compareFemale: value.compare?.patients.female,
          compareOthers: value.compare?.patients.others,
          compareUnknown: value.compare?.patients.unknown,
        }))
    : []

  const appointmentMetrics = analyticsData
    ? Object.entries(analyticsData)
        .filter(([key]) => key !== "__byDoctor")
        .map(([key, value]) => ({
          name: key,
          male: value.appointments.male,
          female: value.appointments.female,
          others: value.appointments.others ?? 0,
          unknown: value.appointments.unknown ?? 0,
          hasMetrics: genderSum(value.appointments) > 0,
          compareMale: value.compare?.appointments.male,
          compareFemale: value.compare?.appointments.female,
          compareOthers: value.compare?.appointments.others,
          compareUnknown: value.compare?.appointments.unknown,
        }))
    : []

  return {
    data: analyticsData,
    byDoctor,
    isLoading:
      (dash ? !dash.ready : mineLoading) || analyticsLoading,
    errorMessage,
    planLocked,
    totalPatients,
    patientMetrics,
    totalAppointments,
    appointmentMetrics,
    calculatePercentage,
    practiceId,
    practiceName,
  }
}
