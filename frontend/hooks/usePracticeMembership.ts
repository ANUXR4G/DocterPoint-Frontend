"use client"

import { useCallback, useEffect, useState } from "react"
import { proctoService } from "@/lib/services/procto"

type Membership = {
  role: string
  practice?: { id: string; name: string; slug?: string }
}

export function usePracticeMembership() {
  const [loading, setLoading] = useState(true)
  const [memberships, setMemberships] = useState<Membership[]>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await proctoService.getMyPractices()
    if (res.status === "successful" && Array.isArray(res.data)) {
      setMemberships(res.data as Membership[])
    } else {
      setMemberships([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const primary = memberships[0]
  const canManage =
    primary?.role === "PRACTICE_OWNER" || primary?.role === "PRACTICE_ADMIN"

  return {
    loading,
    memberships,
    practiceId: proctoService.resolvePracticeId(primary),
    practiceName: primary?.practice?.name ?? null,
    canManage,
    refresh,
  }
}
