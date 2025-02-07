import { userService } from "@/lib/services/user"
import { useApi } from "./useApi"
import { doctorServices } from "@/lib/services/doctor"
import { firey } from "@/utils"
import { TDoctor, TPatient } from "@/types"

export function useUser(role: string | null) {
  // Retrieve user information based on their role
  const { data, isLoading } = useApi(
    ["user:info"],
    async (_, token) => {
      switch (role) {
        case "user":
          return userService.profile(token)
        case "doctor":
          return doctorServices.getDoctorProfile(token)
        default:
          return undefined
      }
    },
    {
      select: (data) => {
        switch (role) {
          case "user":
            return firey.convertKeysToCamelCase(data) as TPatient
          case "doctor":
            return firey.convertKeysToCamelCase(data) as TDoctor

          default:
            return undefined
        }
      },
    }
  )

  return { data, isLoading }
}
