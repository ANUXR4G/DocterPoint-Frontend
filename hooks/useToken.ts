import { useEffect, useState } from "react"
import { cookies } from "@/utils/cookies"
import { userService } from "@/lib/services/user"
import { firey } from "@/utils"

async function refreshAccessToken(token: string) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API}/auth/token/refresh`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) return null

    const data = await response.json()
    return data
  } catch (error) {
    console.error("failed to retrieve refresh access token:", error)
    return null
  }
}

function isTokenExpired(token: string) {
  if (!token) return true
  return firey.getTokenDuration(token) < Date.now() / 1000
}

export function useToken() {
  const [token, setToken] = useState<string>(
    cookies.getCookie("access_token") || cookies.getCookie("refresh_token")
  )

  useEffect(() => {
    async function fetcher() {
      try {
        const accessToken = cookies.getCookie("access_token")
        const accessTokenExpired = isTokenExpired(accessToken)

        // check if the access token is still alive
        if (!accessTokenExpired) {
          setToken(accessToken)
          return
        }

        // check if the refresh token is still alive
        const refreshToken = cookies.getCookie("refresh_token")
        if (!refreshToken || isTokenExpired(refreshToken)) {
          await userService.logout()
          return
        }

        // verify and get a generate new tokens w the refresh token
        const result = await refreshAccessToken(refreshToken)

        if (result) {
          setToken(result.access_token)
        } else {
          await userService.logout()
        }
      } catch (error) {
        console.error("error fetching token:", error)
        await userService.logout()
      }
    }

    fetcher()
  }, [])

  return token
}
