import { useQuery, UseQueryOptions } from "react-query"
import { useToken } from "./useToken"

/**
 * Custom Hook: useApi
 * @param queryKey - The key for the query, used by React Query to identify cached data.
 *                   The second element of the key is used as parameters for the fetcher function.
 * @param fetcher - A function that accepts query parameters (from `queryKey[1]`) and an authentication token,
 *                  and returns a promise resolving to the data fetched.
 * @param options - Optional React Query options, excluding `queryKey` and `queryFn`,
 *                  which are provided by this hook.
 */

export function useApi<
  TQueryKey extends [string, Record<string, unknown>?],
  TQueryFnData,
  TError,
  TData = TQueryFnData
>(
  queryKey: TQueryKey,
  fetcher: (params: TQueryKey[1], token: string) => Promise<TQueryFnData>,
  options?: Omit<
    UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    "queryKey" | "queryFn"
  >
) {
  const token = useToken()

  return useQuery({
    queryKey,
    queryFn: async () => {
      return fetcher(queryKey[1], token)
    },
    ...options,
  })
}

// usage
// const { data } = useApi(["user/profile"], (_, token) => userService.profile(token))
