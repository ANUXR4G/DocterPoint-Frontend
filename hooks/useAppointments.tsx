import { doctorServices } from "@/lib/services/doctor"
import { useApi } from "./useApi"
import { useRole } from "./useRole"
import { useUser } from "./useUser"
import { firey } from "@/utils"
import { patientService } from "@/lib/services/patient"

type TypeAppointment =
  | "requested"
  | "specific"
  | "default"
  | "upcoming"
  | "doctor"

type KeyConfig = {
  [key: string]: (params: URLSearchParams) => string
}

// Api request based on type
const fetchRequests = async (
  type: TypeAppointment,
  token: string,
  userId: string,
  params: URLSearchParams
) => {
  switch (type) {
    case "requested":
      return await doctorServices.getAppointmentRequests(token, userId)

    case "doctor":
      return await doctorServices.getAppointments(
        token,
        userId,
        params.toString()
      )

    case "specific":
      const appointmentId = params?.get("id") || null
      if (!appointmentId)
        throw new Error(`Need required params to retrieve appointment info.`)
      return await patientService.getAppointmentInfo(token, appointmentId)

    case "default":
      throw new Error(`Select atleast one region of interest.`)
  }
}

// function transformData<T>(type: TypeAppointment, data: any) {
//   switch (type) {
//     case "requested":
//       return firey.convertKeysToCamelCase(data) as T

//     case "default":
//       throw new Error(`Select atleast one region of interest.`)
//   }
// }

// Key configuration for different types based on role, type and params
const keyConfig: KeyConfig = {
  doctor: (params?: URLSearchParams) => {
    const page = params?.get("page") || "1"
    return `appointments:page:${page}`
  },
  specific: (params?: URLSearchParams) => {
    const id = params?.get("id") || null
    if (!id) throw new Error(`Provide appointment id as params`)
    return `appointments:info:${id}`
  },
  requested: (_?: URLSearchParams) => {
    return `appointments:requested`
  },
}

export function useAppointments<T>(
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

    const userRole = role === "user" ? "patient" : `${role}`
    const targetType = keyConfig[type](params as URLSearchParams)

    const key = `users:${userRole}:${userInfo.id}:${targetType}`

    return key
  }

  // Caching key for the response
  const queryKey = getQueryKey()

  const { data, isLoading } = useApi(
    [queryKey, { params }],
    (_, token) => {
      if (!userInfo) throw new Error(`Failed to retrieve due to user info`)
      return fetchRequests(
        type,
        token,
        userInfo.id,
        params ?? new URLSearchParams()
      )
    },
    {
      enabled: !!userInfo?.id && !!role,
      select: (data) => firey.convertKeysToCamelCase(data) as T,
      onSuccess,
    }
  )

  return { data, isLoading }
}
