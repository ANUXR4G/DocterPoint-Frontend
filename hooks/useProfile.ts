import { userService } from "@/lib/services/user"
import { useApi } from "./useApi"
import { User } from "@/types"
import { UseMutateFunction, useMutation } from "react-query"
import { useEffect } from "react"
import { queryClient } from "@/app/providers"

type USEPROFILERETURN = {
  data: User | null
  logout: UseMutateFunction<any, unknown, void, unknown>
  isLoading: boolean
}

export function useProfile(allowFetching: boolean = true): USEPROFILERETURN {
  const {
    data: userInfo,
    isError,
    isLoading,
  } = useApi(["user/profile"], (_, token) => userService.profile(token), {
    enabled: allowFetching,
  })

  // handle user log out
  const { mutate, isSuccess: isLogoutSuccess } = useMutation({
    mutationFn: () => userService.logout(),
    onSuccess: () => {
      queryClient.removeQueries(["user/profile"])
    },
  })

  // redirect to login page if user logged out
  useEffect(() => {
    if (typeof window === "undefined") return

    if (isLogoutSuccess) {
      window.location.reload()
    }
  }, [isLogoutSuccess])

  if (isError || !userInfo) {
    return {
      data: null,
      logout: mutate,
      isLoading: false,
    }
  }

  return {
    data: userInfo.data,
    logout: mutate,
    isLoading,
  }
}
