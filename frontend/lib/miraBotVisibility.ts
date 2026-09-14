/** Routes where Mira is shown (middleware already requires auth). */
const MIRA_BOT_PREFIXES = [
  "/patient",
  "/doctor",
  "/clinic",
  "/admin",
  "/settings",
] as const

/**
 * True on signed-in app surfaces. We intentionally do not read auth cookies here:
 * middleware already blocks unauthenticated access to these paths.
 */
export function isMiraBotPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = pathname.split("?")[0].split("#")[0].replace(/\/$/, "") || "/"
  if (path.startsWith("/login")) return false
  return MIRA_BOT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}
