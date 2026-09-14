"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import PublicShell from "@/components/layout/PublicShell"
import { StarRating } from "@/components/ui/procto/PracticeReviewForm"
import {
  getPracticeProviders,
  proctoService,
} from "@/lib/services/procto"

const BookingFlow = dynamic(
  () => import("@/components/ui/procto/BookingFlow"),
  {
    ssr: false,
    loading: () => (
      <p className="rounded-2xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
        Loading booking…
      </p>
    ),
  },
)

type Practice = {
  id: string
  name: string
  slug: string
  specialty: string | null
  consultationFee: number | null
  whatsappBusinessNumber?: string | null
  phone?: string | null
  featured?: boolean
  planName?: string | null
  reviewsEnabled?: boolean
  locations: { id: string; name: string; city: string; address: string }[]
  members: {
    role: string
    user: {
      id: string
      name: string | null
      doctor?: { appointmentValidityDays?: number; licenseNo?: string | null } | null
    }
  }[]
  schedules?: { mode: string; dayOfWeek: number; providerId: string }[]
  reviews?: {
    id: string
    authorName: string
    rating: number
    providerRating?: number | null
    body: string | null
    createdAt: string
  }[]
  reviewSummary?: { average: number | null; count: number }
}

/** Digits for wa.me — prefer 91 + 10-digit Indian mobile. */
function whatsappMeHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return null
  const withCc =
    digits.length === 10
      ? `91${digits}`
      : digits.startsWith("91")
        ? digits
        : digits
  return `https://wa.me/${withCc}`
}

export default function PracticeDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [practice, setPractice] = useState<Practice | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    proctoService.getPractice(slug).then((res) => {
      if (res.status === "successful") setPractice(res.data as Practice)
      else setPractice(null)
      setLoading(false)
    })
  }, [slug])

  const clinicDoctors = practice ? getPracticeProviders(practice.members) : []
  const location = practice?.locations[0]
  const waHref = practice?.whatsappBusinessNumber
    ? whatsappMeHref(practice.whatsappBusinessNumber)
    : null

  const jsonLd = useMemo(() => {
    if (!practice) return null
    const telephone =
      practice.whatsappBusinessNumber || practice.phone || undefined
    const doctors = clinicDoctors.map((d) => ({
      "@type": "Physician",
      name: d.name ? `Dr. ${d.name}` : "Physician",
      ...(telephone ? { telephone } : {}),
      ...(location
        ? {
            address: {
              "@type": "PostalAddress",
              streetAddress: location.address,
              addressLocality: location.city,
            },
          }
        : {}),
    }))
    return {
      "@context": "https://schema.org",
      "@type": "MedicalClinic",
      name: practice.name,
      ...(telephone ? { telephone } : {}),
      ...(location
        ? {
            address: {
              "@type": "PostalAddress",
              streetAddress: location.address,
              addressLocality: location.city,
            },
          }
        : {}),
      ...(doctors.length
        ? { employee: doctors }
        : {
            employee: {
              "@type": "Physician",
              name: practice.name,
              ...(telephone ? { telephone } : {}),
            },
          }),
      ...(practice.reviewSummary?.count
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: practice.reviewSummary.average,
              reviewCount: practice.reviewSummary.count,
            },
          }
        : {}),
    }
  }, [practice, clinicDoctors, location])

  return (
    <PublicShell active="find">
      <div className="max-w-3xl">
        <Link
          href="/practices"
          className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-sky-400"
        >
          ← All doctors
        </Link>

        {loading && (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        )}

        {!loading && !practice && (
          <p className="mt-6 text-sm text-slate-500">Practice not found.</p>
        )}

        {practice && (
          <>
            {jsonLd ? (
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
              />
            ) : null}

            <header className="dashboard-hero mb-8 mt-6">
              <div aria-hidden className="dashboard-hero-glow" />
              <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                  {practice.name}
                </h1>
                {practice.featured ? (
                  <span className="rounded-full bg-blue-600/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">
                    Featured
                    {practice.planName ? ` · ${practice.planName}` : ""}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {practice.specialty ?? "General"} · {location?.city}
                {practice.consultationFee != null &&
                  ` · ₹${practice.consultationFee}`}
              </p>
              {practice.reviewSummary && practice.reviewSummary.count > 0 ? (
                <p className="mt-1">
                  <StarRating
                    average={practice.reviewSummary.average}
                    count={practice.reviewSummary.count}
                  />
                </p>
              ) : null}
              {clinicDoctors.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Doctors at this clinic
                  </p>
                  <ul className="mt-2 space-y-1">
                    {clinicDoctors.map((d) => (
                      <li key={d.id} className="text-sm font-semibold text-slate-900 dark:text-white">
                        Dr. {d.name ?? "Provider"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {location && (
                <p className="mt-3 text-xs text-slate-500">
                  {location.name} — {location.address}
                </p>
              )}
              {waHref && (
                <p className="mt-3">
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-sky-400"
                  >
                    Chat on WhatsApp
                  </a>
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-600 dark:border-white/15 dark:bg-slate-900 dark:text-slate-200"
                  onClick={async () => {
                    const url =
                      typeof window !== "undefined" ? window.location.href : ""
                    const title = practice.name
                    try {
                      if (navigator.share) {
                        await navigator.share({ title, url })
                      } else {
                        await navigator.clipboard.writeText(url)
                        window.alert("Profile link copied.")
                      }
                    } catch {
                      try {
                        await navigator.clipboard.writeText(url)
                        window.alert("Profile link copied.")
                      } catch {
                        /* ignore */
                      }
                    }
                  }}
                >
                  Share profile
                </button>
              </div>
              </div>
            </header>

            <div className="mt-2">
              <BookingFlow practice={practice} />
            </div>

            <section className="dashboard-panel mt-10">
              <h2 className="dashboard-section-title text-lg">Reviews</h2>
              {practice.reviewsEnabled === false ? (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Reviews are available on Growth and Clinic plans for this
                  practice.
                </p>
              ) : (
                <>
                  <ul className="mt-4 space-y-3">
                    {(practice.reviews ?? []).length === 0 && (
                      <li className="text-sm text-slate-500">No reviews yet.</li>
                    )}
                    {(practice.reviews ?? []).map((r) => (
                      <li
                        key={r.id}
                        className="rounded-xl border border-slate-100 bg-sky-50/40 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5"
                      >
                        <p className="font-semibold text-slate-900 dark:text-white">
                          <span className="font-medium">{r.authorName}</span>
                        </p>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">
                          Clinic{" "}
                          <span className="text-blue-600">
                            {"★".repeat(r.rating)}
                          </span>
                          {r.providerRating != null ? (
                            <>
                              {" · "}Doctor{" "}
                              <span className="text-blue-600">
                                {"★".repeat(r.providerRating)}
                              </span>
                            </>
                          ) : null}
                        </p>
                        {r.body ? (
                          <p className="mt-1 text-slate-600 dark:text-slate-400">
                            {r.body}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                    Reviews are from patients who completed a visit at this
                    clinic.
                  </p>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </PublicShell>
  )
}
