import { useEffect, useMemo, useRef, useState } from "react"
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

type AnalyticsCell = TypeAnalytics[string]

function isAnalyticsCell(value: unknown): value is AnalyticsCell {
  return Boolean(
    value &&
      typeof value === "object" &&
      "patients" in (value as object) &&
      "appointments" in (value as object),
  )
}

function unwrapAnalyticsPayload(payload: unknown):
  | (TypeAnalytics & { __byDoctor?: unknown })
  | { __error: true; message: string } {
  if (
    payload &&
    typeof payload === "object" &&
    "status" in payload &&
    (payload as { status?: string }).status === "unsuccessful"
  ) {
    return {
      __error: true,
      message: String(
        (payload as { message?: string }).message ?? "Analytics unavailable",
      ),
    }
  }

  const raw =
    payload &&
    typeof payload === "object" &&
    "status" in payload &&
    (payload as { status?: string }).status === "successful" &&
    "data" in payload &&
    (payload as { data?: unknown }).data != null
      ? (payload as { data: unknown }).data
      : payload

  if (!raw || typeof raw !== "object") {
    return { __error: true, message: "Invalid analytics response" }
  }

  const nested = raw as {
    series?: unknown
    byDoctor?: unknown
    __byDoctor?: unknown
  }

  if (nested.series && typeof nested.series === "object") {
    return {
      ...(nested.series as TypeAnalytics),
      __byDoctor: nested.byDoctor ?? nested.__byDoctor ?? [],
    } as TypeAnalytics & { __byDoctor?: unknown }
  }

  const cellKeys = Object.keys(nested).filter(
    (k) => k !== "byDoctor" && k !== "__byDoctor" && k !== "series",
  )
  if (cellKeys.some((k) => isAnalyticsCell((nested as Record<string, unknown>)[k]))) {
    const { byDoctor, __byDoctor, ...rest } = nested as TypeAnalytics & {
      byDoctor?: unknown
      __byDoctor?: unknown
    }
    return {
      ...(rest as TypeAnalytics),
      __byDoctor: byDoctor ?? __byDoctor ?? [],
    } as TypeAnalytics & { __byDoctor?: unknown }
  }

  return { __error: true, message: "Analytics unavailable" }
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
  isRefreshing: boolean
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [planLocked, setPlanLocked] = useState(false)
  const lastTotalsRef = useRef({ patients: 0, appointments: 0 })

  const dash = usePracticeDashboardOptional()
  const practiceFromShell = dash?.practiceId ?? null

  const { data: mine, isLoading: mineLoading } = useApi(
    ["procto:practices:mine:analytics"],
    () => proctoService.getMyPractices(),
    {
      enabled: !practiceFromShell,
      staleTime: 60_000,
      select: (res) => {
        if (res?.status !== "successful" || !Array.isArray(res.data)) {
          return null
        }
        const m = res.data[0] as {
          practice?: { id: string; name: string }
          practiceId?: string
        }
        const id =
          proctoService.resolvePracticeId(m) ?? m?.practice?.id ?? null
        if (!id) return null
        return { id, name: m?.practice?.name ?? "" }
      },
    },
  )

  const practiceId = practiceFromShell ?? mine?.id ?? null
  const practiceName = practiceFromShell
    ? (dash?.practiceName ?? "")
    : (mine?.name ?? "")

  useEffect(() => {
    lastTotalsRef.current = { patients: 0, appointments: 0 }
    setErrorMessage(null)
    setPlanLocked(false)
  }, [practiceId])

  useEffect(() => {
    // Period / doctor filter changed — drop stale totals until matching series lands.
    lastTotalsRef.current = { patients: 0, appointments: 0 }
  }, [param, providerId])

  const today = startOfToday()
  const currentCurrentMonth = format(today, "MMMM")

  const {
    data,
    isLoading: analyticsLoading,
    isFetching: analyticsFetching,
    isPreviousData,
    isError,
    error,
  } = useApi(
    [`procto:practice:${practiceId}:analytics`, { param, providerId }],
    () => {
      if (!practiceId) throw new Error("No practice")
      return proctoService.getPracticeAnalytics(practiceId, param, providerId)
    },
    {
      enabled: !!practiceId,
      staleTime: 30_000,
      cacheTime: 5 * 60_000,
      // Keep cache warm, but UI must not paint the previous period while a
      // new Daily/Weekly/Monthly filter is loading (looks like filters broken).
      keepPreviousData: true,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      refetchOnWindowFocus: false,
      select: unwrapAnalyticsPayload,
    },
  )

  const filterPending = Boolean(isPreviousData && analyticsFetching)

  useEffect(() => {
    if (data && typeof data === "object" && "__error" in data && data.__error) {
      const msg = String(data.message ?? "Analytics unavailable")
      setErrorMessage(msg)
      setPlanLocked(/subscription|plan|upgrade|locked/i.test(msg))
      return
    }
    if (isError) {
      const msg =
        error instanceof Error ? error.message : "Analytics unavailable"
      setErrorMessage(msg)
      setPlanLocked(/subscription|plan|upgrade|locked/i.test(msg))
      return
    }
    setErrorMessage(null)
    setPlanLocked(false)
  }, [data, isError, error])

  const analyticsData =
    !filterPending &&
    data &&
    typeof data === "object" &&
    !("__error" in data)
      ? (() => {
          const raw = data as TypeAnalytics & { __byDoctor?: unknown }
          const { __byDoctor: _bd, ...series } = raw
          return series as TypeAnalytics
        })()
      : undefined

  const cells = useMemo(() => {
    if (!analyticsData) return [] as Array<[string, AnalyticsCell]>
    return Object.entries(analyticsData).filter(([, value]) =>
      isAnalyticsCell(value),
    ) as Array<[string, AnalyticsCell]>
  }, [analyticsData])

  const totals = useMemo(() => {
    if (!analyticsData) {
      // Keep last good totals during refetch / practice-id flicker so the
      // dashboard does not flash 0 / “No data” on every live reload.
      return lastTotalsRef.current
    }
    const patients = cells.reduce(
      (s, [, cell]) => s + genderSum(cell.patients),
      0,
    )
    const appointments = cells.reduce(
      (s, [, cell]) => s + genderSum(cell.appointments),
      0,
    )
    lastTotalsRef.current = { patients, appointments }
    return lastTotalsRef.current
  }, [analyticsData, cells])

  function calculatePercentage(type: "patients" | "appointments" = "patients") {
    const currentIdx = Number(format(today, "M"))
    if (
      !analyticsData ||
      param === "week" ||
      param === "day" ||
      param === "month" ||
      param === "yoy" ||
      currentIdx === 1
    ) {
      return 0
    }

    const previousMonth = months[currentIdx - 2]
    if (
      !previousMonth ||
      !analyticsData[previousMonth] ||
      !analyticsData[currentCurrentMonth]
    ) {
      return 0
    }

    const previousTotal = genderSum(
      type === "patients"
        ? analyticsData[previousMonth].patients
        : analyticsData[previousMonth].appointments,
    )

    if (previousTotal === 0) return 0

    const currentTotal = genderSum(
      type === "patients"
        ? analyticsData[currentCurrentMonth].patients
        : analyticsData[currentCurrentMonth].appointments,
    )

    return Number(
      (((currentTotal - previousTotal) / previousTotal) * 100).toFixed(2),
    )
  }

  const byDoctor = useMemo(() => {
    if (filterPending) return []
    if (!data || typeof data !== "object" || "__error" in data) return []
    return (
      (
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
      ).__byDoctor ?? []
    )
  }, [data, filterPending])

  const patientMetrics = useMemo(
    () =>
      cells.map(([key, value]) => ({
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
      })),
    [cells],
  )

  const appointmentMetrics = useMemo(
    () =>
      cells.map(([key, value]) => ({
        name: key,
        male: value.appointments.male,
        female: value.appointments.female,
        others: value.appointments.others ?? 0,
        unknown: value.appointments.unknown ?? 0,
        completed: value.status?.completed ?? 0,
        cancelled: value.status?.cancelled ?? 0,
        rescheduled: value.status?.rescheduled ?? 0,
        hasMetrics:
          genderSum(value.appointments) > 0 ||
          (value.status?.completed ?? 0) +
            (value.status?.cancelled ?? 0) +
            (value.status?.rescheduled ?? 0) >
            0,
        compareMale: value.compare?.appointments.male,
        compareFemale: value.compare?.appointments.female,
        compareOthers: value.compare?.appointments.others,
        compareUnknown: value.compare?.appointments.unknown,
        compareCompleted: value.compare?.status?.completed,
        compareCancelled: value.compare?.status?.cancelled,
        compareRescheduled: value.compare?.status?.rescheduled,
      })),
    [cells],
  )

  const waitingForPractice = !practiceId
    ? Boolean(mineLoading || (dash && !dash.practiceId && dash.loading))
    : false

  const isLoading =
    waitingForPractice ||
    filterPending ||
    Boolean(
      practiceId &&
        !analyticsData &&
        !errorMessage &&
        (analyticsLoading || analyticsFetching),
    )

  return {
    data: analyticsData,
    byDoctor,
    isLoading,
    isRefreshing: Boolean(
      analyticsFetching && analyticsData && !filterPending,
    ),
    errorMessage,
    planLocked,
    totalPatients: isLoading && !analyticsData ? 0 : totals.patients,
    patientMetrics,
    totalAppointments: isLoading && !analyticsData ? 0 : totals.appointments,
    appointmentMetrics,
    calculatePercentage,
    practiceId,
    practiceName,
  }
}
