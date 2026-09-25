import { cookies } from "@/utils/cookies"
import { firey } from "@/utils"
import { readAccessTokenFromCookie } from "@/lib/wsOrigin"

/** Same-origin in the browser — avoids localhost vs 127.0.0.1 cookie splits. */
function apiBase() {
  if (typeof window !== "undefined") return "/api/v1"
  return process.env.NEXT_PUBLIC_API ?? "http://127.0.0.1:3000/api/v1"
}

let refreshPromise: Promise<string | null> | null = null

const REFRESH_TIMEOUT_MS = 8_000

function readRawAccessToken(): string {
  return (
    readAccessTokenFromCookie() ||
    cookies.getCookie("access_token") ||
    ""
  )
}

function isAccessTokenFresh(token: string): boolean {
  if (!token) return false
  try {
    // Small skew so we refresh before the JWT actually dies mid-request/WS.
    return firey.getTokenDuration(token) >= Date.now() / 1000 + 30
  } catch {
    return false
  }
}

/**
 * Valid access JWT for REST + WebSocket. Refreshes when the access cookie
 * is missing or expired (REST already did this; WS previously did not).
 * Never returns the refresh token as a stand-in JWT (WS would get 4401).
 */
export async function ensureAccessToken(): Promise<string> {
  const access = readRawAccessToken()
  if (isAccessTokenFresh(access)) return access

  const refresh = cookies.getCookie("refresh_token")
  if (!refresh) return isAccessTokenFresh(access) ? access : ""

  if (refreshPromise) {
    const next = await refreshPromise
    return next || (isAccessTokenFresh(access) ? access : "")
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${apiBase()}/auth/token/refresh`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refresh}`,
        },
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      })
      if (response.status === 429 || response.status >= 500) {
        // Keep a still-fresh access if we have one; never use refresh as JWT.
        const current = readRawAccessToken()
        return isAccessTokenFresh(current) ? current : null
      }
      if (!response.ok) return null
      const body = (await response.json().catch(() => null)) as {
        access_token?: string
        token?: string
      } | null
      const fromBody = body?.access_token || body?.token
      if (fromBody) {
        // Mirror Set-Cookie in case the browser ignored a cross-host cookie.
        cookies.setCookie("access_token", fromBody, 60 * 60 * 2)
      }
      const next = readRawAccessToken() || fromBody || ""
      return isAccessTokenFresh(next) ? next : next || null
    } catch {
      const current = readRawAccessToken()
      return isAccessTokenFresh(current) ? current : null
    } finally {
      refreshPromise = null
    }
  })()

  const refreshed = await refreshPromise
  return refreshed || ""
}
