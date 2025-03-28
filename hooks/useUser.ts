import { firey } from "@/utils"
import { useApi } from "./useApi"
import { userService } from "@/lib/services/user"
import { doctorServices } from "@/lib/services/doctor"
import { TDoctor, TPatient } from "@/types"

export function useUser<T = TPatient | TDoctor>(
  role: string | null
): {
  data?: T
  isLoading: boolean
} {
  // Retrieve user information based on their role
  const { data, isLoading } = useApi(
    ["user:info"],
    async (_, token) => {
      switch (role) {
        // User Profile Information
        case "user":
          return userService.profile(token)
        // Doctor Profile Information
        case "doctor":
          return doctorServices.getDoctorProfile(token)

        // Default Information as undefined
        default:
          return undefined
      }
    },
    {
      // Tranform the data to contain keys maintaining camelCasing standard
      select: (data) => firey.convertKeysToCamelCase(data) as T,
    }
  )

  return { data, isLoading }
}
