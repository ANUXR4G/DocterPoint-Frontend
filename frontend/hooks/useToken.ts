import { useEffect, useState } from "react"
import { cookies } from "@/utils/cookies"
import { userService } from "@/lib/services/user"
import { firey } from "@/utils"

/** Same-origin in the browser — avoids localhost vs 127.0.0.1 cookie splits. */
function apiBase() {
  if (typeof window !== "undefined") return "/api/v1"
  return process.env.NEXT_PUBLIC_API ?? "http://127.0.0.1:3000/api/v1"
}

/** Shared in-flight refresh so many useToken() callers don't stampede the API. */
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(token: string): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${apiBase()}/auth/token/refresh`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })

      // Rate-limited or transient — keep existing session; do not logout.
      if (response.status === 429 || response.status >= 500) {
        return cookies.getCookie("access_token") || token
      }

      // Auth failure — session is dead.
      if (response.status === 401 || response.status === 403) {
        return null
      }

      if (!response.ok) {
        return cookies.getCookie("access_token") || token
      }

      await response.json().catch(() => null)
      return cookies.getCookie("access_token") || token
    } catch (error) {
      console.error("failed to retrieve refresh access token:", error)
      // Network blip — keep refresh token; caller can retry later.
      return cookies.getCookie("access_token") || token
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

function isTokenExpired(token: string) {
  if (!token) return true
  return firey.getTokenDuration(token) < Date.now() / 1000
}

function readValidAccessToken() {
  const accessToken = cookies.getCookie("access_token")
  if (accessToken && !isTokenExpired(accessToken)) return accessToken
  return ""
}

export function useToken() {
  const [token, setToken] = useState<string>(readValidAccessToken)

  useEffect(() => {
    let cancelled = false

    async function fetcher() {
      try {
        const accessToken = readValidAccessToken()
        if (accessToken) {
          if (!cancelled) setToken(accessToken)
          return
        }

        const refreshToken = cookies.getCookie("refresh_token")
        if (!refreshToken) {
          if (!cancelled) setToken("")
          return
        }

        if (isTokenExpired(refreshToken)) {
          await userService.logout()
          if (!cancelled) setToken("")
          return
        }

        const result = await refreshAccessToken(refreshToken)

        if (cancelled) return

        if (result) {
          setToken(result)
        } else {
          await userService.logout()
          setToken("")
        }
      } catch (error) {
        console.error("error fetching token:", error)
        // Avoid logout storms on unexpected errors while a refresh cookie exists.
        if (!cancelled) {
          const fallback =
            readValidAccessToken() || cookies.getCookie("refresh_token") || ""
          setToken(fallback)
        }
      }
    }

    fetcher()
    return () => {
      cancelled = true
    }
  }, [])

  return token
}
