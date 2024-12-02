import { firey } from "@/utils"
import { cookies } from "@/utils/cookies"
import { useRouter } from "next/navigation"
import { useLayoutEffect, useState } from "react"

async function refreshAccessToken(token: string) {
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
}

function isTokenExpired(token: string) {
  if (token.length === 0) return true
  return firey.getTokenDuration(token) < Date.now() / 1000
}

export function useToken() {
  const [token, setToken] = useState<string>(
    cookies.getCookie("access_token") || cookies.getCookie("refresh_token")
  )

  useLayoutEffect(() => {
    async function fetcher() {
      const accessToken = cookies.getCookie("access_token")
      const accessTokenExpired = isTokenExpired(accessToken)

      // check if the access token is still alive
      if (!accessTokenExpired) {
        setToken(accessToken)
        return
      }

      // check if the refresh token is still alive
      const refresh_token = cookies.getCookie("refresh_token")
      const refresh_token_expired = isTokenExpired(refresh_token)

      // if the refresh token has been expired do nothing
      if (refresh_token_expired) {
        // router.push('/patients/login')
        return
      }

      // verify and get a generate new tokens w the refresh token
      const result = await refreshAccessToken(refresh_token)

      // set newly generated tokens as cookies
      if (result) {
        setToken(result.access_token)
      }
    }

    fetcher()
  }, [])

  return token
}
