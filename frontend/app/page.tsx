import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { SCOPES } from "@/scopes"
import HomePage from "@/components/marketing/HomePage"
import { providerDashboardFromContext } from "@/lib/providerPortal"

export const metadata: Metadata = {
  title: "GlucoGuide — Find doctors & book clinic visits",
  description:
    "Search doctors and clinics, book appointments, and manage diabetes care in one place.",
}

const dashboardURLs: Record<string, string> = {
  doctor: "/doctor/dashboard",
  admin: "/admin/dashboard",
}

function extractScope(token: string): string[] {
  try {
    const [, payload] = token.split(".")
    const decoded = JSON.parse(atob(payload))
    return decoded.scopes || []
  } catch {
    return []
  }
}

function resolveProviderDashboard(
  scopes: string[],
  portalCookie?: string | null,
): string | null {
  if (SCOPES.admin.every((s) => scopes.includes(s))) return dashboardURLs.admin
  if (SCOPES.doctor.every((s) => scopes.includes(s))) {
    return providerDashboardFromContext("doctor", null, portalCookie)
  }
  return null
}

export default async function Home() {
  const cookieStore = await cookies()
  const token = cookieStore.get("refresh_token")?.value
  if (token) {
    const dashboard = resolveProviderDashboard(
      extractScope(token),
      cookieStore.get("gg_portal")?.value,
    )
    if (dashboard) redirect(dashboard)
  }

  return <HomePage />
}
