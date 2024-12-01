import { useQuery, UseQueryOptions } from "react-query"
import { useToken } from "./useToken"

export function useApi<
  TQueryKey extends [string, Record<string, unknown>?],
  TQueryFnData,
  TError,
  TData = TQueryFnData
>(
  queryKey: TQueryKey,
  fetcher: (
    params: TQueryKey[1],
    token: string | null
  ) => Promise<TQueryFnData>,
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
