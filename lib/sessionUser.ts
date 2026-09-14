import { cookies } from "@/utils/cookies"
import { firey } from "@/utils"

/** JWT `sub` is the User UUID used by care chat + Procto. */
export function getSessionUserId(): string | null {
  const token =
    cookies.getCookie("access_token") || cookies.getCookie("refresh_token") || ""
  if (!token) return null
  const info = firey.getTokenInfo(token)
  if (!info || info === "firey" || typeof info !== "object") return null
  const sub = (info as { sub?: unknown }).sub
  return typeof sub === "string" && sub.length > 10 ? sub : null
}
