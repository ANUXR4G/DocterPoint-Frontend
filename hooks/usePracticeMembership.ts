"use client"

import { useCallback, useEffect, useState } from "react"
import { proctoService } from "@/lib/services/procto"
import { usePracticeDashboardOptional } from "@/contexts/PracticeDashboardContext"

type Membership = {
  role: string
  practiceId?: string
  id?: string
  practice?: { id: string; name: string; slug?: string }
}

/**
 * Prefer shared PracticeDashboardProvider (already fetched + live).
 * Fall back to a light /mine call outside the provider.
 */
export function usePracticeMembership() {
  const dash = usePracticeDashboardOptional()
  const [loading, setLoading] = useState(true)
  const [memberships, setMemberships] = useState<Membership[]>([])

  const refresh = useCallback(async () => {
    if (dash?.practiceId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await proctoService.getMyPractices()
      if (res.status === "successful" && Array.isArray(res.data)) {
        setMemberships(res.data as Membership[])
      } else {
        setMemberships([])
      }
    } catch {
      setMemberships([])
    } finally {
      setLoading(false)
    }
  }, [dash?.practiceId])

  useEffect(() => {
    if (dash?.practiceId) {
      setLoading(false)
      return
    }
    // Still waiting on dashboard shell — don't spin forever.
    if (dash && dash.loading) {
      setLoading(true)
      return
    }
    void refresh()
  }, [dash, dash?.practiceId, dash?.loading, refresh])

  if (dash?.practiceId) {
    return {
      loading: false,
      memberships: dash.memberships as Membership[],
      practiceId: dash.practiceId,
      practiceName: dash.practiceName,
      canManage: dash.isClinicAdmin,
      refresh: async () => {
        await dash.refresh({ silent: true })
      },
    }
  }

  const primary = memberships[0]
  const canManage =
    primary?.role === "PRACTICE_OWNER" || primary?.role === "PRACTICE_ADMIN"

  return {
    loading: dash ? dash.loading || loading : loading,
    memberships,
    practiceId: proctoService.resolvePracticeId(primary),
    practiceName: primary?.practice?.name ?? null,
    canManage,
    refresh,
  }
}
