import { NextResponse, NextRequest } from "next/server"
import { SCOPES } from "./scopes"

const PROTECTED_ROUTES = [
  "/patient/:path*",
  "/doctor/:path*",
  "/clinic/:path*",
  "/admin/:path*",
  "/hospitals:path*",
  "/settings:path*",
]
const AUTH_ROUTES = [
  "/login",
  "/login/patient",
  "/login/doctor",
  "/login/clinic",
  "/login/admin",
  "/signup",
]

const roleScopes: Record<string, string[]> = {
  patient: SCOPES["user"],
  doctor: SCOPES["doctor"],
  admin: SCOPES["admin"],
}

const checkScopes = (
  userScopes: string[],
  requiredScopes: string[],
): boolean => {
  return requiredScopes.every((scope) => userScopes.includes(scope))
}

function extractScope(token?: string): string[] {
  if (!token) return []
  try {
    const [, payload] = token.split(".")
    const decodedPayload = JSON.parse(atob(payload))
    return decodedPayload.scopes || []
  } catch {
    return []
  }
}

function loginPathForProtectedRoute(pathname: string): string {
  if (pathname.startsWith("/admin")) return "/login/admin"
  if (pathname.startsWith("/clinic")) return "/login/clinic"
  if (pathname.startsWith("/doctor")) return "/login/doctor"
  if (pathname.startsWith("/patient")) return "/login/patient"
  return "/login"
}

function providerDashboardFromRequest(req: NextRequest): string {
  const portal = req.cookies.get("gg_portal")?.value
  if (portal === "clinic") return "/clinic/dashboard"
  return "/doctor/dashboard"
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === "/patient/appointments" || pathname.startsWith("/patient/appointments/")) {
    const url = req.nextUrl.clone()
    url.pathname = "/patient/bookings"
    return NextResponse.redirect(url)
  }

  if (
    pathname === "/doctor/appointments/patients" ||
    (pathname === "/settings" &&
      req.nextUrl.searchParams.get("tab") === "practice" &&
      req.nextUrl.searchParams.get("subtab") === "patients")
  ) {
    const url = req.nextUrl.clone()
    url.pathname = "/doctor/patients"
    url.search = ""
    return NextResponse.redirect(url)
  }

  if (
    pathname === "/hospitals" ||
    pathname === "/hospitals/doctors" ||
    pathname === "/hospitals/doctors/info"
  ) {
    const url = req.nextUrl.clone()
    url.pathname = "/practices"
    url.search = ""
    return NextResponse.redirect(url)
  }

  if (pathname === "/admin/inbox") {
    const url = req.nextUrl.clone()
    url.pathname = "/admin/approvals"
    return NextResponse.redirect(url)
  }

  if (
    pathname === "/admin/hospitals" ||
    pathname.startsWith("/admin/users/patients")
  ) {
    const url = req.nextUrl.clone()
    url.pathname = "/admin/dashboard"
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith("/admin/users/doctor")) {
    const url = req.nextUrl.clone()
    url.pathname = "/admin/doctors"
    return NextResponse.redirect(url)
  }

  const isProtectedRoute = PROTECTED_ROUTES.some((route) => {
    const regex = new RegExp(`^${route.replace(":path*", ".*")}$`)
    return regex.test(pathname)
  })

  const token = req.cookies.get("refresh_token")?.value
  const userScopes = extractScope(token)

  if (isProtectedRoute && !token) {
    const destination = req.nextUrl.href.split(
      `${process.env.NEXT_PUBLIC_OG_URL}/`,
    )[1]
    const loginBase = loginPathForProtectedRoute(pathname)
    const url = destination
      ? `${loginBase}?callback=${encodeURIComponent(destination)}`
      : loginBase
    return NextResponse.redirect(new URL(url, req.nextUrl))
  }

  const protectedAreas = [
    { prefix: "/patient", scopes: roleScopes.patient, login: "/login/patient" },
    { prefix: "/doctor", scopes: roleScopes.doctor, login: "/login/doctor" },
    { prefix: "/clinic", scopes: roleScopes.doctor, login: "/login/clinic" },
    { prefix: "/admin", scopes: roleScopes.admin, login: "/login/admin" },
  ] as const

  for (const area of protectedAreas) {
    if (pathname.startsWith(area.prefix) && !checkScopes(userScopes, area.scopes)) {
      return NextResponse.redirect(new URL(area.login, req.nextUrl))
    }
  }

  const isAuthRoute =
    AUTH_ROUTES.includes(pathname) || pathname.startsWith("/login/")

  if (token && isAuthRoute) {
    if (checkScopes(userScopes, roleScopes.patient)) {
      return NextResponse.redirect(new URL("/patient/dashboard", req.nextUrl))
    }
    if (checkScopes(userScopes, roleScopes.doctor)) {
      if (pathname.startsWith("/login/clinic")) {
        return NextResponse.redirect(new URL("/clinic/dashboard", req.nextUrl))
      }
      if (pathname.startsWith("/login/doctor")) {
        return NextResponse.redirect(new URL("/doctor/dashboard", req.nextUrl))
      }
      return NextResponse.redirect(
        new URL(providerDashboardFromRequest(req), req.nextUrl),
      )
    }
    if (checkScopes(userScopes, roleScopes.admin)) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.nextUrl))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
}
