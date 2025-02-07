import { firey } from "@/utils"
import { cookies } from "@/utils/cookies"
import { useToken } from "./useToken"
import { SCOPES } from "@/scopes"

function identifyRole(tokenScopes: string[]): string | null {
  if (!tokenScopes) return null

  for (const [role, roleScopes] of Object.entries(SCOPES)) {
    if (tokenScopes.every((scope) => roleScopes.includes(scope))) {
      return role
    }
  }
  return null // Return null if no matching role is found
}

export function useRole() {
  const token = useToken()

  const decodedToken = firey.getTokenInfo(
    token || cookies.getCookie("refresh_token")
  )

  const userRole = decodedToken ? identifyRole(decodedToken?.scopes) : null

  return userRole
}
