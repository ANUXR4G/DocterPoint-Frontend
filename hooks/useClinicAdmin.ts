"use client"

import { useCallback, useEffect, useState } from "react"
import { proctoService } from "@/lib/services/procto"

type Membership = {
  role: string
  practice?: { id: string; name: string }
}

/**
 * Clinic owners/admins manage the Doctors roster.
 * Individual DOCTOR members should not see clinic doctor management.
 */
export function useClinicAdmin() {
  const [loading, setLoading] = useState(true)
  const [isClinicAdmin, setIsClinicAdmin] = useState(false)
  const [hasPractice, setHasPractice] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await proctoService.getMyPractices()
    if (res.status === "successful" && Array.isArray(res.data)) {
      const list = res.data as Membership[]
      setHasPractice(list.length > 0)
      setIsClinicAdmin(
        list.some(
          (m) =>
            m.role === "PRACTICE_OWNER" || m.role === "PRACTICE_ADMIN",
        ),
      )
    } else {
      setHasPractice(false)
      setIsClinicAdmin(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { loading, isClinicAdmin, hasPractice, refresh }
}
