import { useQueries, UseQueryOptions, UseQueryResult } from "react-query"
import { useToken } from "./useToken"

/**
 * Custom Hook: useApis
 * @param queryKey - The key for the query, used by React Query to identify cached data.
 *                   The second element of the key is used as parameters for the fetcher function.
 * @param fetcher - A function that accepts query parameters (from `queryKey[1]`) and an authentication token,
 *                  and returns a promise resolving to the data fetched.
 * @param options - Optional React Query options, excluding `queryKey` and `queryFn`,
 *                  which are provided by this hook.
 */

export function useApis<
  TQueryKey extends [string, Record<string, unknown>?],
  TQueryFnData,
  TError,
  TData = TQueryFnData
>(
  queries: {
    queryKey: TQueryKey
    fetcher: (params: TQueryKey[1], token: string) => Promise<TQueryFnData>
    options?: Omit<
      UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
      "queryKey" | "queryFn"
    >
  }[]
) {
  const token = useToken()

  const queryConfigs = queries.map(({ queryKey, fetcher, options }) => ({
    queryKey,
    queryFn: async () => {
      return fetcher(queryKey[1], token)
    },
    ...options,
  }))

  return useQueries(queryConfigs)
}
