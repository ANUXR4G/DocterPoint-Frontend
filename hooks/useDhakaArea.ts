"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  DHAKA_AREAS,
  detectDhakaAreaFromDevice,
  type DhakaArea,
  type MatchResult,
} from "@/lib/location/dhakaAreas"

type Status = "idle" | "detecting" | "ready" | "error"

type Options = {
  /** Run GPS match once on mount (asks browser permission). */
  autoDetect?: boolean
  /** Called when area is set via Near me / auto-detect / chip. */
  onCityChange?: (city: string) => void
}

/**
 * Device geolocation → one of four Dhaka service areas (local match, no API).
 */
export function useDhakaArea(initialCity = "", options: Options = {}) {
  const { autoDetect = false, onCityChange } = options
  const [city, setCityState] = useState(initialCity)
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [match, setMatch] = useState<MatchResult | null>(null)
  const didAutoDetect = useRef(false)
  const onCityChangeRef = useRef(onCityChange)
  onCityChangeRef.current = onCityChange

  const setCity = useCallback((next: string) => {
    setCityState(next)
    onCityChangeRef.current?.(next)
  }, [])

  const selectArea = useCallback(
    (area: DhakaArea | null) => {
      const name = area?.name ?? ""
      setCityState(name)
      setMatch(null)
      setMessage(area ? `Showing clinics in ${area.label}.` : null)
      setStatus(area ? "ready" : "idle")
      onCityChangeRef.current?.(name)
    },
    [],
  )

  const detectNearMe = useCallback(async () => {
    setStatus("detecting")
    setMessage(null)
    const res = await detectDhakaAreaFromDevice()
    if (!res.ok) {
      setStatus("error")
      setMessage(res.message)
      return null
    }
    setMatch(res.result)
    setCityState(res.result.area.name)
    setStatus("ready")
    setMessage(
      res.result.match === "bounds"
        ? `You're in ${res.result.area.label} — showing clinics there.`
        : `Closest area: ${res.result.area.label} (~${res.result.distanceKm.toFixed(1)} km) — showing clinics there.`,
    )
    onCityChangeRef.current?.(res.result.area.name)
    return res.result
  }, [])

  useEffect(() => {
    if (!autoDetect || didAutoDetect.current) return
    didAutoDetect.current = true
    void detectNearMe()
  }, [autoDetect, detectNearMe])

  return {
    city,
    setCity,
    status,
    message,
    match,
    areas: DHAKA_AREAS,
    selectArea,
    detectNearMe,
    isDetecting: status === "detecting",
  }
}
