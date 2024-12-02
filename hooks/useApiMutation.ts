import { useMutation, UseMutationOptions } from "react-query"
import { useToken } from "./useToken"

export function useApiMutation<
  TMutationKey extends [string, Record<string, unknown>?],
  TMutationFnData,
  TError,
  TData = TMutationFnData
>(
  mutationKey: TMutationKey,
  mutationFn: (
    variables: TMutationKey[1],
    token: string
  ) => Promise<TMutationFnData>,
  options?: Omit<
    UseMutationOptions<TMutationFnData, TError, TData, TMutationKey>,
    "mutationKey" | "mutationFn"
  >
) {
  const token = useToken()
  return useMutation({
    mutationKey,
    mutationFn: async () => {
      return mutationFn(mutationKey[1], token)
    },
    ...options,
  })
}

// usage
// const { mutate } = useApiMutation(["user/logout"], (_, token) => userService.logout(token))
