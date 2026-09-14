export type ProviderPortal = "doctor" | "clinic"

export const PORTAL_COOKIE = "gg_portal"

export function providerDashboard(portal: ProviderPortal): string {
  return portal === "clinic" ? "/clinic/dashboard" : "/doctor/dashboard"
}

export function providerLoginPath(portal: ProviderPortal): string {
  return portal === "clinic" ? "/login/clinic" : "/login/doctor"
}

export function portalFromPathname(pathname: string | null): ProviderPortal | null {
  if (!pathname) return null
  if (pathname.startsWith("/clinic")) return "clinic"
  if (pathname.startsWith("/doctor")) return "doctor"
  return null
}

export function navRoleFromContext(
  jwtRole: string | null | undefined,
  pathname: string | null,
  portalCookie?: string | null,
): string | null {
  const pathPortal = portalFromPathname(pathname)
  if (pathPortal) return pathPortal

  if (jwtRole === "doctor" && portalCookie === "clinic") return "clinic"
  if (jwtRole === "doctor" && portalCookie === "doctor") return "doctor"
  return jwtRole ?? null
}

export function providerDashboardFromContext(
  jwtRole: string | null | undefined,
  pathname: string | null,
  portalCookie?: string | null,
): string {
  if (jwtRole === "user") return "/patient/dashboard"
  if (jwtRole === "admin") return "/admin/dashboard"
  if (jwtRole !== "doctor") return "/patient/dashboard"

  const portal =
    portalFromPathname(pathname) ??
    (portalCookie === "clinic" || portalCookie === "doctor"
      ? portalCookie
      : "doctor")

  return providerDashboard(portal)
}
