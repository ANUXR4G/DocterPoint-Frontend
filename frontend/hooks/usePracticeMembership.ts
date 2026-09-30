"use client"

import { useCallback, useEffect, useState } from "react"
import { proctoService } from "@/lib/services/procto"
import { usePracticeDashboardOptional } from "@/contexts/PracticeDashboardContext"

type Membership = {
  role: string
  practiceId?: string
  id?: string
  practice?: {
    id: string
    name: string
    slug?: string
    type?: string
    members?: Array<{ role: string }>
  }
}

/** Mirrors backend assertProfileEditor: owner/admin, or the only doctor of a SOLO practice. */
function canManagePractice(m: Membership | undefined): boolean {
  if (!m) return false
  if (m.role === "PRACTICE_OWNER" || m.role === "PRACTICE_ADMIN") return true
  return (
    m.role === "DOCTOR" &&
    m.practice?.type === "SOLO" &&
    (m.practice.members?.length ?? 0) === 1
  )
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
      canManage: canManagePractice(dash.memberships[0] as Membership | undefined),
      refresh: async () => {
        await dash.refresh({ silent: true })
      },
    }
  }

  const primary = memberships[0]
  const canManage = canManagePractice(primary)

  return {
    loading: dash ? dash.loading || loading : loading,
    memberships,
    practiceId: proctoService.resolvePracticeId(primary),
    practiceName: primary?.practice?.name ?? null,
    canManage,
    refresh,
  }
}
