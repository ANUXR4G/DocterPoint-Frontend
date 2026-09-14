/** WebSocket host (hostname:port) for the GlucoGuide backend. */
export function getWsOrigin(): string {
  const env = process.env.NEXT_PUBLIC_WS_ORIGIN
  if (env) return env.replace(/^wss?:\/\//, "")

  if (typeof window === "undefined") return "localhost:3001"

  return window.location.hostname === "localhost"
    ? "localhost:3001"
    : window.location.host
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
