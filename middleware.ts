import { NextResponse, NextRequest } from "next/server"
import { SCOPES } from "./scopes"

const PROTECTED_ROUTES = [
  "/patient/:path*",
  "/doctor/:path*",
  "/hospitals:path*",
  "/settings:path*",
]
const AUTH_ROUTES = ["/login", "/signup"]

// Define role-based routes and scopes
const roleScopes: Record<string, string[]> = {
  patient: SCOPES["user"],
  doctor: SCOPES["doctor"],
  admin: SCOPES["admin"],
}

// Define role-based dashboard for users
const dashboardURLs: { [key: string]: string } = {
  patient: "/patient/dashboard",
  doctor: "/doctor/dashboard",
  admin: "/admin/dashboard",
}

// Check if the user scopes matches the required scopes
const checkScopes = (
  userScopes: string[],
  requiredScopes: string[]
): boolean => {
  return requiredScopes.every((scope) => userScopes.includes(scope))
}

// Extract scopes from token
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isProtectedRoute = PROTECTED_ROUTES.some((route) => {
    const regex = new RegExp(`^${route.replace(":path*", ".*")}$`)
    return regex.test(pathname)
  })

  const token = req.cookies.get("refresh_token")?.value // token stored as cookie
  const userScopes = extractScope(token) // scopes extracted from token

  // Redirect to login page if user is trying to access protected routes without a token
  if (isProtectedRoute && !token) {
    // Get the triggering routing identifier
    const destination = req.nextUrl.href.split(
      `${process.env.NEXT_PUBLIC_OG_URL}/`
    )[1]
    const url = destination
      ? `/login?callback=${encodeURIComponent(destination)}`
      : "/login" // Callback based on routing identifier
    return NextResponse.redirect(new URL(url, req.nextUrl))
  }

  // Restrict protected routes based on scopes
  // e.g, if /patient/dashboard page holder visits /doctor/dashboard page,
  // Then redirect to /login page which will eventually make that dude land/redirect on/to his own dashboard
  for (const [role, _] of Object.entries(dashboardURLs)) {
    if (
      pathname.startsWith(`/${role}`) &&
      !checkScopes(userScopes, roleScopes[role])
    ) {
      return NextResponse.redirect(new URL("/login", req.nextUrl))
    }
  }

  // Redirect authenticted users to dashboards from login/signup pages
  for (const [role, url] of Object.entries(dashboardURLs)) {
    if (
      token &&
      AUTH_ROUTES.includes(pathname) &&
      checkScopes(userScopes, roleScopes[role])
    ) {
      return NextResponse.redirect(new URL(url, req.nextUrl))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
}
