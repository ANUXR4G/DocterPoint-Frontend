import { useEffect } from "react"
import { useMutation } from "react-query"

import { firey } from "@/utils"
import { TPatient } from "@/types"
import { useApi } from "@/hooks/useApi"
import { queryClient } from "@/app/providers"
import { userService } from "@/lib/services/user"
import {
  fetchUserProfile,
  USER_PROFILE_QUERY_KEY,
} from "@/lib/queries/profile"

export function useProfile(): {
  data?: TPatient
  isLoading: boolean
} {
  const {
    data: userInfo,
    isLoading,
  } = useApi(
    USER_PROFILE_QUERY_KEY,
    async (_, token) => {
      if (token) return fetchUserProfile(token)
    },
    {
      select: (data) => firey.convertKeysToCamelCase(data) as TPatient,
    }
  )

  // Handle user log out
  const { mutate, isSuccess: isLogoutSuccess } = useMutation({
    mutationFn: () => userService.logout(),
    onSuccess: () => {
      queryClient.clear()
    },
  })

  // Redirect to login page if user logged out
  useEffect(() => {
    if (typeof window === "undefined") return

    if (isLogoutSuccess) {
      window.location.reload()
    }
  }, [isLogoutSuccess])

  return {
    data: userInfo,
    isLoading,
  }
}
