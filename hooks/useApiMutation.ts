import { useMutation, UseMutationOptions } from "react-query"
import { useToken } from "./useToken"

export function useApiMutation<
  TVariables = unknown,
  TMutationFnData = unknown,
  TError = unknown,
  TContext = unknown
>(
  mutationFn: (
    variables: TVariables,
    token: string
  ) => Promise<TMutationFnData>,
  options?: Omit<
    UseMutationOptions<TMutationFnData, TError, TVariables, TContext>,
    "mutationFn"
  >
) {
  const token = useToken()

  return useMutation<TMutationFnData, TError, TVariables, TContext>({
    mutationFn: async (variables) => {
      if (!token) {
        throw new Error("Authentication is required")
      }
      return mutationFn(variables, token)
    },
    ...options,
  })
}

// usage
// const { mutate } = useApiMutation<{ payload: any }>(({ payload }, token) => userService.update(token, payload))
