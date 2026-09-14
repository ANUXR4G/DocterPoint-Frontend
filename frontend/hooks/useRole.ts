import { firey } from "@/utils"
import { cookies } from "@/utils/cookies"
import { usePathname } from "next/navigation"
import { useToken } from "./useToken"
import { SCOPES } from "@/scopes"

const ROLE_ORDER = ["admin", "doctor", "user"] as const

function identifyRole(tokenScopes: string[]): string | null {
  if (!tokenScopes?.length) return null

  // User has a role when their token includes every scope that role requires
  for (const role of ROLE_ORDER) {
    const roleScopes = SCOPES[role]
    if (roleScopes.every((scope) => tokenScopes.includes(scope))) {
      return role
    }
  }

  return null
}

function roleFromPathname(pathname: string): string | null {
  if (pathname.startsWith("/doctor")) return "doctor"
  if (pathname.startsWith("/patient")) return "user"
  if (pathname.startsWith("/admin")) return "admin"
  return null
}

export function useRole() {
  const token = useToken()
  const pathname = usePathname()

  const decodedToken = firey.getTokenInfo(
    token || cookies.getCookie("refresh_token"),
  )

  const scopes =
    decodedToken && typeof decodedToken === "object"
      ? (decodedToken.scopes as string[] | undefined)
      : undefined

  const userRole = scopes ? identifyRole(scopes) : null

  return userRole ?? roleFromPathname(pathname)
}
