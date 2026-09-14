"use client"

import Link from "next/link"
import { cookies } from "@/utils/cookies"

/** True if the browser has any GlucoGuide session cookie. */
export function hasAuthSession() {
  if (typeof window === "undefined") return false
  return Boolean(
    cookies.getCookie("access_token") || cookies.getCookie("refresh_token"),
  )
}

export function patientBookingLoginUrl(practiceSlug: string) {
  const callback = encodeURIComponent(`/practices/${practiceSlug}`)
  return `/login/patient?callback=${callback}`
}

type BookAppointmentLinkProps = {
  slug: string
  className?: string
  children?: React.ReactNode
}

/** Opens the public practice profile / booking page. */
export default function BookAppointmentLink({
  slug,
  className,
  children = "Book appointment →",
}: BookAppointmentLinkProps) {
  return (
    <Link href={`/practices/${slug}`} className={className}>
      {children}
    </Link>
  )
}
