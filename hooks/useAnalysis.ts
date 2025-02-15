import { doctorServices } from "@/lib/services/doctor"
import { useApi } from "./useApi"
import { useRole } from "./useRole"
import { useUser } from "./useUser"
import { format, startOfToday } from "date-fns"
import { months } from "@/lib/dummy/calender"
import { AnalyticMetrics, TypeAnalytics, TypeAnalyticsParam } from "@/types"

export function useAnalytics(param: TypeAnalyticsParam = "week"): {
  data?: TypeAnalytics
  isLoading: boolean
  patientMetrics: AnalyticMetrics[]
  appointmentMetrics: AnalyticMetrics[]
  calculatePercentage: (type?: "patients" | "appointments") => number
} {
  const role = useRole()

  // Retrieve the doctor information
  const { data: userInfo } = useUser(role)

  const today = startOfToday()

  // Retrieve the doctor analytics key
  const { data, isLoading } = useApi(
    [`users:doctor:${userInfo?.id}:analytics`, { param }],
    (_, token) => {
      if (!userInfo) throw new Error(`Failed to retrieve doctor analytics`)
      return doctorServices.fetchAnalytics(token, userInfo.id, param)
    },
    {
      enabled: !!userInfo?.id && !!role,
      select: (data) => data as TypeAnalytics,
    }
  )

  // Calculate the analysis based on specified records
  function calculatePercentage(type: "patients" | "appointments" = "patients") {
    const currentIdx = Number(format(today, "M"))
    if (!data || param === "week" || currentIdx === 1) return 0 // Skip the first month

    const previousMonth = months[currentIdx - 2]
    const currentCurrentMonth = format(today, "MMMM")

    // Calculate the total visits of previous period
    const previousTotal =
      type === "patients"
        ? data[previousMonth].patients.male +
          data[previousMonth].patients.female
        : data[previousMonth].appointments.male +
          data[previousMonth].appointments.female

    if (previousTotal === 0) return 0

    // Calculate the total visits of current period
    const currentTotal =
      type === "patients"
        ? data[currentCurrentMonth].patients.male +
          data[previousMonth].patients.female
        : data[currentCurrentMonth].appointments.male +
          data[previousMonth].appointments.female

    const percentageChange = (
      ((currentTotal - previousTotal) / previousTotal) *
      100
    ).toFixed(2)

    return Number(percentageChange)
  }

  // Refactor the metrics based on patients
  const patientMetrics = data
    ? Object.entries(data).map(([key, value]) => ({
        name: key,
        male: value.patients.male,
        female: value.patients.female,
        hasMetrics: value.patients.male > 0 && value.patients.female > 0,
      }))
    : []

  // Refactor the metrics based on apppointments
  const appointmentMetrics = data
    ? Object.entries(data).map(([key, value]) => ({
        name: key,
        male: value.appointments.male,
        female: value.appointments.female,
        hasMetrics:
          value.appointments.male > 0 && value.appointments.female > 0,
      }))
    : []

  return {
    data,
    isLoading,
    patientMetrics,
    appointmentMetrics,
    calculatePercentage,
  }
}
