import { NextResponse, NextRequest } from "next/server"

const PROTECTED_ROUTES = ["/patient/:path*", "/doctor/:path*"]
const AUTH_ROUTES = ["/login", "/signup"]

const SCOPES: Record<string, string[]> = {
  user: [
    "patient:read_profile",
    "patient:update_profile",
    "patient:update_password",
  ],
  doctor: [
    "patient:read_profile",
    "patient:update_profile",
    "doctor:read_profile",
    "doctor:update_profile",
  ],
}

// define role-based routes and scopes
const roleScopes: Record<string, string[]> = {
  patient: SCOPES["user"],
  doctor: SCOPES["doctor"],
}

// define role-based dashboard for users
const dashboardURLs: { [key: string]: string } = {
  patient: "/patient/dashboard",
  doctor: "/doctor/dashboard",
}

// check if the user scopes matches the required scopes
const checkScopes = (
  userScopes: string[],
  requiredScopes: string[]
): boolean => {
  return requiredScopes.every((scope) => userScopes.includes(scope))
}

// extract scopes from token
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

  // redirect to login page if user is trying to access protected routes without a token
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  // restrict protected routes based on scopes
  // e.g, if /patient/dashboard page holder visits /doctor/dashboard page,
  // then redirect to /login page which will eventually make that dude land/redirect on/to his own dashboard
  for (const [role, _] of Object.entries(dashboardURLs)) {
    if (
      pathname.startsWith(`/${role}`) &&
      !checkScopes(userScopes, roleScopes[role])
    ) {
      return NextResponse.redirect(new URL("/login", req.nextUrl))
    }
  }

  // redirect authenticted users to dashboards from login/signup pages
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
