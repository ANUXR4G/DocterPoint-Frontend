import { userService } from "@/lib/services/user"
import { useApi } from "./useApi"
import { TPatient } from "@/types"
import { UseMutateFunction, useMutation } from "react-query"
import { useEffect } from "react"
import { queryClient } from "@/app/providers"
import { firey } from "@/utils"
import { useRouter } from "next/navigation"

type USEPROFILERETURN = {
  data?: TPatient
  logout: UseMutateFunction<any, unknown, void, unknown>
  isLoading: boolean
}

export function useProfile(allowFetching: boolean = true): USEPROFILERETURN {
  const router = useRouter()
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
      enabled: allowFetching,
      onError: async () => {
        await userService.logout()
        router.refresh()
      },
      select: (data) => firey.convertKeysToCamelCase(data) as TPatient,
    }
  )

  // handle user log out
  const { mutate, isSuccess: isLogoutSuccess } = useMutation({
    mutationFn: () => userService.logout(),
    onSuccess: () => {
      queryClient.clear()
      // queryClient.removeQueries(["users:profile"])
    },
  })

  // redirect to login page if user logged out
  useEffect(() => {
    if (typeof window === "undefined") return

    if (isLogoutSuccess) {
      window.location.reload()
    }
  }, [isLogoutSuccess])

  // if (isError || !userInfo) {
  //   return {
  //     logout: mutate,
  //     isLoading: false,
  //   }
  // }

  return {
    data: userInfo,
    logout: mutate,
    isLoading,
  }
}
