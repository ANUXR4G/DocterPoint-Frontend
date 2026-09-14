"use client"

import { useEffect } from "react"
import { useQueryClient } from "react-query"
import { useAppContext } from "@/hooks/useAppContext"
import { useRole } from "@/hooks/useRole"
import { useToken } from "@/hooks/useToken"
import { doctorServices } from "@/lib/services/doctor"
import {
  fetchUserProfile,
  USER_PROFILE_QUERY_KEY,
} from "@/lib/queries/profile"
import { isTextSize } from "@/lib/textSize"

/**
 * Loads text-size preference from the backend profile and applies it.
 */
export function AppearanceSync() {
  const role = useRole()
  const token = useToken()
  const queryClient = useQueryClient()
  const { changeTextSize } = useAppContext()

  useEffect(() => {
    if (!token) return
    if (role !== "doctor" && role !== "user") return

    let cancelled = false

    async function load() {
      try {
        const profile =
          role === "doctor"
            ? await doctorServices.getDoctorProfile(token)
            : await queryClient.fetchQuery(
                USER_PROFILE_QUERY_KEY,
                () => fetchUserProfile(token),
              )
        if (cancelled || !profile) return
        const size = profile.text_size ?? profile.textSize
        if (isTextSize(size)) changeTextSize(size)
      } catch {
        /* keep local preference */
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [role, token, queryClient, changeTextSize])

  return null
}
