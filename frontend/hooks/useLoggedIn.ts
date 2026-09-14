"use client"

import { cookies } from "@/utils/cookies"
import { useToken } from "@/hooks/useToken"

/** True when the browser has an active session (access or refresh token). */
export function useLoggedIn(): boolean {
  const token = useToken()
  const refresh = cookies.getCookie("refresh_token")
  return Boolean(token || refresh)
}
