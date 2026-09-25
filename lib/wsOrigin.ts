/** Prefer IPv4 — macOS resolves `localhost` to ::1, which can hit another app on the same port. */
function forceIpv4Loopback(host: string): string {
  return host.replace(/^localhost(?=:|$)/i, "127.0.0.1")
}

function configuredWsHostPort(): { host: string; port: string } {
  const raw = (process.env.NEXT_PUBLIC_WS_ORIGIN ?? "127.0.0.1:3002")
    .replace(/^wss?:\/\//, "")
    .trim()
  const idx = raw.lastIndexOf(":")
  if (idx > 0 && /^\d+$/.test(raw.slice(idx + 1))) {
    return { host: raw.slice(0, idx), port: raw.slice(idx + 1) }
  }
  return { host: raw || "127.0.0.1", port: "3002" }
}

/**
 * WebSocket host (hostname:port) for the GlucoGuide backend.
 * Uses the page hostname on LAN/phones so WS is not stuck on 127.0.0.1
 * while HTTP goes through the Next proxy on the device's reachable IP.
 */
export function getWsOrigin(): string {
  const { host: cfgHost, port } = configuredWsHostPort()

  if (typeof window !== "undefined") {
    const pageHost = window.location.hostname
    if (pageHost && pageHost !== "localhost" && pageHost !== "127.0.0.1") {
      return `${pageHost}:${port}`
    }
  }

  return forceIpv4Loopback(`${cfgHost}:${port}`)
}

export function getWsScheme(): "ws" | "wss" {
  if (typeof window === "undefined") return "ws"
  if (window.location.protocol === "https:") return "wss"
  const env = process.env.NEXT_PUBLIC_WS_ORIGIN ?? ""
  if (env.startsWith("wss://")) return "wss"
  return "ws"
}

export function buildWsUrl(path: string, token?: string | null): string {
  const normalized = path.startsWith("/") ? path : `/${path}`
  const qs =
    token && !normalized.includes("token=")
      ? `${normalized.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
      : ""
  return `${getWsScheme()}://${getWsOrigin()}${normalized}${qs}`
}

export function readAccessTokenFromCookie(): string | undefined {
  if (typeof document === "undefined") return undefined
  const match = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("access_token="))
  if (!match) return undefined
  return decodeURIComponent(match.slice("access_token=".length))
}
