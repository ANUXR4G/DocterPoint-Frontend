import { useEffect } from "react"
import { useMutation } from "react-query"

import { firey } from "@/utils"
import { TPatient } from "@/types"
import { useApi } from "@/hooks/useApi"
import { queryClient } from "@/app/providers"
import { userService } from "@/lib/services/user"

export function useProfile(): {
  data?: TPatient
  isLoading: boolean
} {
  const {
    data: userInfo,
    isError,
    isLoading,
  } = useApi(
    ["users:profile"],
    async (_, token) => {
      if (token) return userService.profile(token)
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
