import { firey } from "@/utils"
import { useApi } from "./useApi"
import { userService } from "@/lib/services/user"
import { doctorServices } from "@/lib/services/doctor"
import { TDoctor, TPatient } from "@/types"
import {
  fetchAccount,
  fetchUserProfile,
  USER_ACCOUNT_QUERY_KEY,
  USER_PROFILE_QUERY_KEY,
} from "@/lib/queries/profile"

export function useUser<T = TPatient | TDoctor>(
  role: string | null
): {
  data?: T
  isLoading: boolean
} {
  const isPatient = role === "user"
  const isAdmin = role === "admin"

  const { data, isLoading } = useApi(
    isPatient
      ? USER_PROFILE_QUERY_KEY
      : isAdmin
        ? USER_ACCOUNT_QUERY_KEY
        : ["user:info", { role: role ?? "" }],
    async (_, token) => {
      switch (role) {
        case "user":
          return fetchUserProfile(token)
        case "admin":
          return fetchAccount(token)
        case "doctor":
          return doctorServices.getDoctorProfile(token)
        default:
          return undefined
      }
    },
    {
      enabled: role === "user" || role === "doctor" || role === "admin",
      select: (data) => firey.convertKeysToCamelCase(data) as T,
    }
  )

  return { data, isLoading }
}
