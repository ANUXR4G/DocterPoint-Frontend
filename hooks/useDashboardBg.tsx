"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useQueryClient } from "react-query"
import { cookies } from "@/utils/cookies"
import { doctorServices } from "@/lib/services/doctor"
import { proctoService } from "@/lib/services/procto"
import { useRole } from "@/hooks/useRole"
import {
  fetchUserProfile,
  USER_PROFILE_QUERY_KEY,
} from "@/lib/queries/profile"

type Membership = {
  role: string
  practice?: {
    id: string
    name: string
    bgSrc?: string | null
    bg_src?: string | null
  }
}

type DashboardBgValue = {
  loading: boolean
  personalBg: string | null
  clinicBg: string | null
  resolvedBg: string | null
  practiceId: string | null
  practiceName: string
  isClinicAdmin: boolean
  hasPractice: boolean
  refresh: () => Promise<void>
  setPersonalBgLocal: (v: string | null) => void
  setClinicBgLocal: (v: string | null) => void
}

const DashboardBgContext = createContext<DashboardBgValue | null>(null)

/**
 * Resolves dashboard background: personal doctor → clinic → default.
 * Shared via provider so Theme settings and layouts stay in sync after save.
 */
export function DashboardBgProvider({ children }: { children: ReactNode }) {
  const role = useRole()
  const queryClient = useQueryClient()
  const [personalBg, setPersonalBg] = useState<string | null>(null)
  const [clinicBg, setClinicBg] = useState<string | null>(null)
  const [practiceId, setPracticeId] = useState<string | null>(null)
  const [practiceName, setPracticeName] = useState<string>("")
  const [isClinicAdmin, setIsClinicAdmin] = useState(false)
  const [hasPractice, setHasPractice] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (role !== "doctor" && role !== "user") {
      setPersonalBg(null)
      setClinicBg(null)
      setPracticeId(null)
      setPracticeName("")
      setIsClinicAdmin(false)
      setHasPractice(false)
      setLoading(false)
      return
    }

    setLoading(true)
    const token = cookies.getCookie("access_token") || ""

    if (role === "user") {
      const profile = await queryClient
        .fetchQuery(USER_PROFILE_QUERY_KEY, () => fetchUserProfile(token))
        .catch(() => null)
      const data = (profile as { data?: Record<string, unknown> } | null)?.data
      const personal =
        (data?.bg_src as string | null | undefined) ??
        (data?.bgSrc as string | null | undefined) ??
        null
      setPersonalBg(personal || null)
      setClinicBg(null)
      setPracticeId(null)
      setPracticeName("")
      setIsClinicAdmin(false)
      setHasPractice(false)
      setLoading(false)
      return
    }

    const [profile, mine] = await Promise.all([
      doctorServices.getDoctorProfile(token).catch(() => null),
      proctoService.getMyPractices(),
    ])

    if (profile) {
      const personal =
        (profile.bg_src as string | null | undefined) ??
        (profile.bgSrc as string | null | undefined) ??
        null
      setPersonalBg(personal || null)
    }

    if (
      mine.status === "successful" &&
      Array.isArray(mine.data) &&
      mine.data.length
    ) {
      const list = mine.data as Membership[]
      const m = list[0]
      const p = m?.practice
      setPracticeId(p?.id ?? null)
      setPracticeName(p?.name ?? "")
      setClinicBg(p?.bgSrc ?? p?.bg_src ?? null)
      setHasPractice(true)
      setIsClinicAdmin(
        list.some(
          (item) =>
            item.role === "PRACTICE_OWNER" || item.role === "PRACTICE_ADMIN",
        ),
      )
    } else {
      setPracticeId(null)
      setPracticeName("")
      setClinicBg(null)
      setHasPractice(false)
      setIsClinicAdmin(false)
    }
    setLoading(false)
  }, [role, queryClient])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const resolvedBg = useMemo(() => {
    if (personalBg) return personalBg
    if (role === "doctor" && clinicBg) return clinicBg
    return null
  }, [personalBg, clinicBg, role])

  const value = useMemo<DashboardBgValue>(
    () => ({
      loading,
      personalBg,
      clinicBg,
      resolvedBg,
      practiceId,
      practiceName,
      isClinicAdmin,
      hasPractice,
      refresh,
      setPersonalBgLocal: setPersonalBg,
      setClinicBgLocal: setClinicBg,
    }),
    [
      loading,
      personalBg,
      clinicBg,
      resolvedBg,
      practiceId,
      practiceName,
      isClinicAdmin,
      hasPractice,
      refresh,
    ],
  )

  return (
    <DashboardBgContext.Provider value={value}>
      {children}
    </DashboardBgContext.Provider>
  )
}

export function useDashboardBg(): DashboardBgValue {
  const ctx = useContext(DashboardBgContext)
  if (!ctx) {
    throw new Error("useDashboardBg must be used within DashboardBgProvider")
  }
  return ctx
}
