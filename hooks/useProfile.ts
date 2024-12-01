import { userService } from "@/lib/services/user"
import { useQuery } from "react-query"
import { useToken } from "./useToken"
import { User } from "@/types"

export const useProfile = () => {
  const token = useToken()

  const { data, isError, error } = useQuery<User | null, Error>({
    queryKey: ["user/profile"],
    queryFn: () => userService.profile(token),
  })

  if (isError || !data) {
    console.log(error)
    return null
  }

  return data
}
