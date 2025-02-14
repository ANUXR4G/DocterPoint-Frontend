import { doctorServices } from "@/lib/services/doctor"
import { useRole } from "./useRole"
import { useUser } from "./useUser"
import { useApi } from "./useApi"
import { firey } from "@/utils"

type TypeRequests = "doctor" | "specific" | "default"

// Dynamically handle fetch requests based on request type
const fetchRequests = async (
  type: TypeRequests,
  token: string,
  userId: string,
  params?: URLSearchParams
) => {
  switch (type) {
    case "doctor":
      if (!params) throw new Error(`Need required params to retrieve data.`)
      return await doctorServices.getPatients(token, userId, params.toString())

    case "default":
      throw new Error(`Declare atleast one region of interest.`)
  }
}

export default function usePatients<T>(
  type: TypeRequests = "default",
  params?: URLSearchParams
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
    const targetType = type === "doctor" ? "patients" : type

    const page = params ? params.get("page") || 1 : 1

    const key = `users:${userRole}:${userInfo.id}:${targetType}`

    if (["doctor"].includes(type)) {
      return `${key}:page:${page}`
    }

    return key
  }

  const queryKey = getQueryKey()

  const { data, isLoading } = useApi(
    [queryKey, { params }],
    (_, token) => {
      if (!userInfo) throw new Error(`Failed to retrieve due to user info.`)
      return fetchRequests(type, token, userInfo.id, params)
    },
    {
      enabled: !!userInfo?.id && !!role,
      select: (data) => firey.convertKeysToCamelCase(data) as T,
    }
  )

  return { data, isLoading }
}
