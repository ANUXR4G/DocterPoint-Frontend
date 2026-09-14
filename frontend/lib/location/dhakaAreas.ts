/** Four GlucoGuide service areas in Dhaka — matched locally (no maps API). */

export type DhakaAreaId = "gulshan" | "dhanmondi" | "uttara" | "mirpur"

export type DhakaArea = {
  id: DhakaAreaId
  /** Value used for practice/hospital city filters */
  name: string
  label: string
  /** Approximate bounding box */
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  /** Center used for nearest-area fallback */
  center: { lat: number; lng: number }
}

export const DHAKA_AREAS: DhakaArea[] = [
  {
    id: "gulshan",
    name: "Gulshan",
    label: "Gulshan",
    bounds: { minLat: 23.768, maxLat: 23.812, minLng: 90.405, maxLng: 90.435 },
    center: { lat: 23.7925, lng: 90.4175 },
  },
  {
    id: "dhanmondi",
    name: "Dhanmondi",
    label: "Dhanmondi",
    bounds: { minLat: 23.728, maxLat: 23.762, minLng: 90.365, maxLng: 90.395 },
    center: { lat: 23.7465, lng: 90.377 },
  },
  {
    id: "uttara",
    name: "Uttara",
    label: "Uttara",
    bounds: { minLat: 23.848, maxLat: 23.905, minLng: 90.368, maxLng: 90.425 },
    center: { lat: 23.875, lng: 90.395 },
  },
  {
    id: "mirpur",
    name: "Mirpur",
    label: "Mirpur",
    bounds: { minLat: 23.788, maxLat: 23.845, minLng: 90.348, maxLng: 90.385 },
    center: { lat: 23.822, lng: 90.365 },
  },
]

export const DHAKA_AREA_NAMES = DHAKA_AREAS.map((a) => a.name)

function inBounds(
  lat: number,
  lng: number,
  b: DhakaArea["bounds"],
): boolean {
  return (
    lat >= b.minLat &&
    lat <= b.maxLat &&
    lng >= b.minLng &&
    lng <= b.maxLng
  )
}

function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Greater Dhaka rough box — outside this we still fall back to nearest area. */
const GREATER_DHAKA = {
  minLat: 23.65,
  maxLat: 23.95,
  minLng: 90.28,
  maxLng: 90.52,
}

export type MatchResult = {
  area: DhakaArea
  /** Exact box hit vs nearest center */
  match: "bounds" | "nearest"
  coords: { lat: number; lng: number }
  distanceKm: number
}

/** Pure local match — no network / geocoding API. */
export function matchDhakaArea(lat: number, lng: number): MatchResult {
  for (const area of DHAKA_AREAS) {
    if (inBounds(lat, lng, area.bounds)) {
      return {
        area,
        match: "bounds",
        coords: { lat, lng },
        distanceKm: distanceKm({ lat, lng }, area.center),
      }
    }
  }

  let best = DHAKA_AREAS[0]!
  let bestDist = distanceKm({ lat, lng }, best.center)
  for (const area of DHAKA_AREAS.slice(1)) {
    const d = distanceKm({ lat, lng }, area.center)
    if (d < bestDist) {
      best = area
      bestDist = d
    }
  }

  return {
    area: best,
    match: "nearest",
    coords: { lat, lng },
    distanceKm: bestDist,
  }
}

export function isInGreaterDhaka(lat: number, lng: number): boolean {
  return inBounds(lat, lng, GREATER_DHAKA)
}

export type GeolocationErrorCode =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unknown"

export async function getDeviceCoordinates(opts?: {
  timeoutMs?: number
  highAccuracy?: boolean
}): Promise<
  | { ok: true; lat: number; lng: number }
  | { ok: false; code: GeolocationErrorCode; message: string }
> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      ok: false,
      code: "unsupported",
      message: "Location is not supported in this browser.",
    }
  }

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: opts?.highAccuracy ?? true,
        timeout: opts?.timeoutMs ?? 12_000,
        maximumAge: 60_000,
      })
    })
    return {
      ok: true,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    }
  } catch (err) {
    const e = err as GeolocationPositionError
    if (e?.code === 1) {
      return {
        ok: false,
        code: "denied",
        message: "Location permission denied. Pick an area below.",
      }
    }
    if (e?.code === 2) {
      return {
        ok: false,
        code: "unavailable",
        message: "Location unavailable. Pick an area below.",
      }
    }
    if (e?.code === 3) {
      return {
        ok: false,
        code: "timeout",
        message: "Location timed out. Pick an area below.",
      }
    }
    return {
      ok: false,
      code: "unknown",
      message: "Could not read location. Pick an area below.",
    }
  }
}

/** Device GPS → local Dhaka area (no third-party API). */
export async function detectDhakaAreaFromDevice(): Promise<
  | { ok: true; result: MatchResult }
  | { ok: false; code: GeolocationErrorCode; message: string }
> {
  const coords = await getDeviceCoordinates()
  if (!coords.ok) return coords
  return { ok: true, result: matchDhakaArea(coords.lat, coords.lng) }
}
