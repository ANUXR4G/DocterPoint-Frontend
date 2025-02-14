import { doctorServices } from "@/lib/services/doctor"
import { useApi } from "./useApi"
import { useRole } from "./useRole"
import { useUser } from "./useUser"
import { firey } from "@/utils"

type TypeAppointment =
  | "requested"
  | "specific"
  | "default"
  | "upcoming"
  | "doctor"

const fetchRequests = async (
  type: TypeAppointment,
  token: string,
  userId: string,
  params?: URLSearchParams
) => {
  switch (type) {
    case "requested":
      return await doctorServices.getAppointmentRequests(token, userId)

    case "doctor":
      if (!params)
        throw new Error(`Need required params to retrieve doctor appointments.`)
      return await doctorServices.getAppointments(
        token,
        userId,
        params.toString()
      )

    case "default":
      throw new Error(`Select atleast one region of interest.`)
  }
}

function transformData<T>(type: TypeAppointment, data: any) {
  switch (type) {
    case "requested":
      return firey.convertKeysToCamelCase(data) as T

    case "doctor":
      return firey.convertKeysToCamelCase(data) as T

    case "default":
      throw new Error(`Select atleast one region of interest.`)
  }
}

export default function useAppointments<T>(
  type: TypeAppointment = "default",
  params?: URLSearchParams
): {
  data?: T
  isLoading: boolean
} {
  const role = useRole()
  const { data: userInfo } = useUser(role)

  // Dynamically created key based on role and type of data
  const queryKey = `user:${role === `user` ? `patient` : role}:${
    type === `doctor` ? `appointments` : type
  }:${userInfo?.id}:page:${params ? params.get("page") || 1 : 1}`

  const { data, isLoading } = useApi(
    [queryKey, { params }],
    (_, token) => {
      if (!userInfo) throw new Error(`Failed to retrieve due to user info.`)
      return fetchRequests(type, token, userInfo.id, params)
    },
    {
      enabled: !!userInfo?.id && !!role,
      select: (data) => transformData<T>(type, data),
    }
  )

  return { data, isLoading }
}
