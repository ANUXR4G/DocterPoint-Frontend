import { firey } from "@/utils"
import { useApi } from "./useApi"
import { useRole } from "./useRole"
import { useUser } from "./useUser"
import { doctorServices } from "@/lib/services/doctor"

type TypeAppointment =
  | "requested"
  | "specific"
  | "default"
  | "upcoming"
  | "appointments"
  | "patient"

type KeyConfig = {
  [key: string]: (params: URLSearchParams) => string
}

// Api request based on type
const fetchRequests = async (
  type: TypeAppointment,
  token: string,
  params: URLSearchParams
) => {
  switch (type) {
    case "requested":
      return await doctorServices.getRequestedAppointments(token)

    case "appointments":
      return await doctorServices.getAppointments(token, params.toString())

    case "specific":
      const appointmentId = params?.get("info") || null
      if (!appointmentId)
        throw new Error(`Need required params to retrieve appointment info.`)
      return await doctorServices.getAppointmentInfo(token, appointmentId)

    case "patient":
      const patientId = params?.get("id") || null
      if (!patientId)
        throw new Error(
          `Need required params to retrieve appointments of the patient.`
        )
      return await doctorServices.getPatientAppointments(token, patientId)

    case "default":
      throw new Error(`Select atleast one region of interest.`)
  }
}

// Key configuration for different types based on role, type and params
const keyConfig: KeyConfig = {
  appointments: (params?: URLSearchParams) => {
    const page = params?.get("page") || "1"
    return `appointments:page:${page}`
  },
  specific: (params?: URLSearchParams) => {
    const id = params?.get("info") || null
    if (!id) throw new Error(`Provide appointment id as params`)
    return `appointments:info:${id}`
  },
  patient: (params?: URLSearchParams) => {
    const id = params?.get("id") || null
    if (!id) throw new Error(`Provide patient id as params`)
    return `appointments:patient:info:${id}`
  },
  requested: (_?: URLSearchParams) => {
    return `appointments:requested`
  },
}

export function useDoctor<T>(
  type: TypeAppointment = "default",
  params?: URLSearchParams,
  onSuccess?: (data: unknown) => void
): {
  data?: T
  isLoading: boolean
} {
  const role = useRole()
  const { data: userInfo } = useUser(role)

  // Dynamically created key based on role and type of data
  const getQueryKey = () => {
    if (!userInfo?.id || !role) return ""
    const targetType = keyConfig[type](params as URLSearchParams)
    const key = `users:${role}:${userInfo.id}:${targetType}`
    return key
  }

  // Generate dynamic caching key based on type of fetching
  const queryKey = getQueryKey()

  const { data, isLoading } = useApi(
    [queryKey, { params }],
    (_, token) => {
      if (!userInfo) throw new Error(`Failed to retrieve due to user info`)
      return fetchRequests(type, token, params ?? new URLSearchParams())
    },
    {
      enabled: !!userInfo?.id && !!role,
      select: (data) => firey.convertKeysToCamelCase(data) as T,
      onSuccess,
    }
  )

  return { data, isLoading }
}
